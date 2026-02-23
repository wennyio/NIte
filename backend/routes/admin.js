const express = require('express');
const router = express.Router();
const { orchestrate, getBuildStatus } = require('../generator/orchestrate');
const { getSupabaseClient } = require('../modules/supabase');
const { countAppFiles, getAppFilesForCustomer } = require('../modules/live-app');
const { restoreCompiledFilesToDisk } = require('../modules/restore-generated');

function getSupabaseOr503(res) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    res.status(503).json({ error: 'Supabase is not configured' });
    return null;
  }
  return supabase;
}

function mapAppStatusToBuildStatus(appStatus) {
  if (appStatus === 'live') return 'complete';
  if (appStatus === 'complete') return 'complete';
  if (appStatus === 'error') return 'error';
  if (appStatus === 'generating') return 'generating';
  if (appStatus === 'queued') return 'queued';
  if (appStatus === 'pending') return 'queued';
  return 'idle';
}

async function promoteCustomerSnapshotToLive(supabase, customerId, options = {}) {
  const { restoreToDisk = true } = options;
  if (!customerId) throw new Error('customerId is required');

  const counts = await countAppFiles(supabase, customerId);
  if (counts.compiled === 0 || counts.source === 0) {
    throw new Error('Selected customer has no complete generated app snapshot (source + compiled). Generate the app first.');
  }

  const compiled = await getAppFilesForCustomer(supabase, customerId, ['compiled']);
  if (!compiled.files.length) {
    throw new Error('No compiled app files found for selected customer.');
  }

  const restored = restoreToDisk ? restoreCompiledFilesToDisk(compiled.files) : { restoredCount: 0, skippedCount: 0 };

  const demote = await supabase
    .from('customers')
    .update({ app_status: 'pending' })
    .eq('app_status', 'live')
    .neq('id', customerId);
  if (demote.error) throw demote.error;

  const { data, error } = await supabase
    .from('customers')
    .update({ app_status: 'live' })
    .eq('id', customerId)
    .select('*')
    .single();
  if (error) throw error;

  return { customer: data, restored, counts };
}

function slugifyBusinessName(name) {
  const base = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return base || `biz-${Date.now()}`;
}

async function generateUniqueSubdomain(supabase, businessName) {
  const reserved = new Set(['www', 'admin', 'dashboard', 'start', 'api']);
  const raw = slugifyBusinessName(businessName);
  const base = reserved.has(raw) ? `${raw}-site` : raw;
  for (let attempt = 0; attempt < 100; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const lookup = await supabase
      .from('customers')
      .select('id')
      .eq('subdomain', candidate)
      .limit(1);
    if (lookup.error) throw lookup.error;
    if (!Array.isArray(lookup.data) || lookup.data.length === 0) return candidate;
  }
  return `${base}-${Date.now()}`;
}

// Get all customers
router.get('/customers', async (req, res) => {
  try {
    const supabase = getSupabaseOr503(res);
    if (!supabase) return;
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/customers/:id/routing', async (req, res) => {
  try {
    const supabase = getSupabaseOr503(res);
    if (!supabase) return;

    const { container_url } = req.body || {};
    let normalizedContainerUrl = null;
    if (container_url) {
      try {
        const parsed = new URL(String(container_url).trim());
        normalizedContainerUrl = parsed.origin;
      } catch {
        return res.status(400).json({ error: 'container_url must be a valid URL' });
      }
    }

    const { data, error } = await supabase
      .from('customers')
      .update({ container_url: normalizedContainerUrl })
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw error;
    res.json({ success: true, customer: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create customer from intake
router.post('/customers', async (req, res) => {
  try {
    const supabase = getSupabaseOr503(res);
    if (!supabase) return;
    const { business_name, business_type, owner_name, owner_email } = req.body;
    if (!business_name || !owner_email) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const subdomain = await generateUniqueSubdomain(supabase, business_name);
    const { data, error } = await supabase
      .from('customers')
      .insert({
        business_name,
        business_type,
        owner_name,
        owner_email,
        subdomain,
        status: 'active',
        tier: 'growth',
        app_status: 'pending',
      })
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Generate app from intake
router.post('/generate', async (req, res) => {
  try {
    const { businessContext, customerId } = req.body;
    if (!businessContext || !businessContext.business_type || !businessContext.business_name) {
      return res.status(400).json({ error: 'Missing business context' });
    }

    const supabase = getSupabaseOr503(res);
    if (!supabase) return;
    if (customerId) {
      const queuedUpdate = await supabase
        .from('customers')
        .update({ app_status: 'queued' })
        .eq('id', customerId);
      if (queuedUpdate.error) {
        console.error(`Failed to pre-set queued status for ${customerId}:`, queuedUpdate.error.message);
      }
    }

    const result = await orchestrate(businessContext, customerId || null);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Build status
router.get('/build-status', async (req, res) => {
  try {
    const { customerId } = req.query;
    if (customerId) {
      const supabase = getSupabaseOr503(res);
      if (!supabase) return;
      const { data, error } = await supabase
        .from('customers')
        .select('id, app_status')
        .eq('id', customerId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return res.json({ status: 'idle', customerId });

      const global = getBuildStatus();
      const dbMappedStatus = mapAppStatusToBuildStatus(data.app_status);
      const globalMatchesCustomer = global?.customerId === customerId || global?.activeCustomerId === customerId;
      if (globalMatchesCustomer && ['idle', 'queued', 'generating'].includes(dbMappedStatus) && ['queued', 'generating', 'complete', 'error'].includes(global?.status)) {
        return res.json({
          status: global.status,
          customerId: data.id,
          appStatus: data.app_status || 'pending',
          source: 'global-fallback'
        });
      }

      if (['pending', 'queued', 'generating', 'error'].includes(data.app_status || '')) {
        try {
          const recovered = await promoteCustomerSnapshotToLive(supabase, customerId);
          return res.json({
            status: 'complete',
            customerId: recovered.customer.id,
            appStatus: recovered.customer.app_status || 'live',
            autoRecovered: true
          });
        } catch {
          // No complete snapshot yet; continue returning current mapped status.
        }
      }

      return res.json({
        status: dbMappedStatus,
        customerId: data.id,
        appStatus: data.app_status || 'pending'
      });
    }

    res.json(getBuildStatus());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/ping', (req, res) => res.json({ ping: 'pong' }));

router.post('/set-live', async (req, res) => {
  try {
    const supabase = getSupabaseOr503(res);
    if (!supabase) return;

    const { customerId } = req.body || {};
    if (!customerId) {
      return res.status(400).json({ error: 'customerId is required' });
    }

    const promoted = await promoteCustomerSnapshotToLive(supabase, customerId);
    res.json({ success: true, customer: promoted.customer, restored: promoted.restored });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
