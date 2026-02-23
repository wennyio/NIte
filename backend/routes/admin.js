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

function guessBusinessTypeFromPrompt(prompt) {
  const text = String(prompt || '').toLowerCase();
  if (/(salon|barber|barbershop|beauty|spa|lashes|nails|stylist)/.test(text)) return 'salon';
  if (/(gym|fitness|workout|trainer|crossfit)/.test(text)) return 'gym';
  if (/(yoga|wellness|meditation|pilates)/.test(text)) return 'yoga studio';
  if (/(restaurant|food|truck|cafe|coffee|bakery|kitchen)/.test(text)) return 'food business';
  if (/(lawn|landscap|cleaning|pressure wash|plumb|electric|handyman|repair)/.test(text)) return 'home service';
  if (/(ecommerce|e-commerce|shop|store|retail|product)/.test(text)) return 'ecommerce';
  return 'service business';
}

function extractServicesFromPrompt(prompt) {
  const text = String(prompt || '');
  const services = [];
  const pricedRegex = /([A-Za-z][A-Za-z0-9 '&/.-]{2,50}?)\s*(?:for|at|is)?\s*\$([0-9]{1,5}(?:\.[0-9]{1,2})?)/g;
  let match;
  while ((match = pricedRegex.exec(text)) !== null) {
    const name = String(match[1] || '').trim().replace(/\s+/g, ' ');
    const price = Number(match[2]);
    if (!name || !Number.isFinite(price)) continue;
    services.push({ name, price, duration: '60 min' });
    if (services.length >= 12) break;
  }
  return services;
}

function sanitizeBusinessContext(rawContext, originalPrompt) {
  const raw = rawContext && typeof rawContext === 'object' ? rawContext : {};
  const prompt = String(originalPrompt || '').trim();
  const baseNameFromPrompt = String(prompt.split(/[.!?\n]/)[0] || '')
    .replace(/^(build|create|make)\s+/i, '')
    .trim();
  const guessedType = guessBusinessTypeFromPrompt(prompt);
  const business_name = String(raw.business_name || baseNameFromPrompt || 'New Business').slice(0, 120).trim() || 'New Business';
  const business_type = String(raw.business_type || guessedType || 'service business').slice(0, 80).trim() || 'service business';
  const owner_name = String(raw.owner_name || 'Owner').slice(0, 80).trim() || 'Owner';

  const emailCandidate = String(raw.owner_email || '').trim();
  const safeEmailLocal = slugifyBusinessName(business_name).replace(/-/g, '') || 'owner';
  const owner_email = /\S+@\S+\.\S+/.test(emailCandidate)
    ? emailCandidate
    : `${safeEmailLocal}@nite.local`;

  const rawServices = Array.isArray(raw.services) ? raw.services : [];
  const normalizedServices = rawServices
    .map((item) => {
      if (!item) return null;
      if (typeof item === 'string') {
        return { name: item.trim(), duration: '60 min' };
      }
      const name = String(item.name || '').trim();
      if (!name) return null;
      const normalized = { name, duration: String(item.duration || '60 min').trim() || '60 min' };
      const price = Number(item.price);
      if (Number.isFinite(price) && price >= 0) normalized.price = price;
      return normalized;
    })
    .filter(Boolean)
    .slice(0, 12);
  const services = normalizedServices.length > 0 ? normalizedServices : extractServicesFromPrompt(prompt);

  const staff = Array.isArray(raw.staff) && raw.staff.length > 0
    ? raw.staff.map((s) => String(s || '').trim()).filter(Boolean).slice(0, 12)
    : ['owner'];

  const needs = Array.isArray(raw.needs) && raw.needs.length > 0
    ? raw.needs.map((n) => String(n || '').trim()).filter(Boolean).slice(0, 12)
    : [prompt].filter(Boolean);

  const public_features = Array.isArray(raw.public_features) && raw.public_features.length > 0
    ? raw.public_features.map((f) => String(f || '').trim()).filter(Boolean).slice(0, 12)
    : ['booking page', 'service menu', 'contact info'];
  const dashboard_features = Array.isArray(raw.dashboard_features) && raw.dashboard_features.length > 0
    ? raw.dashboard_features.map((f) => String(f || '').trim()).filter(Boolean).slice(0, 12)
    : ['appointment management', 'client profiles', 'revenue dashboard', 'staff management'];

  return {
    business_name,
    business_type,
    owner_name,
    owner_email,
    services,
    staff,
    needs,
    public_features,
    dashboard_features,
    owner_prompt: prompt
  };
}

async function parsePromptWithClaude(prompt) {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) return null;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1400,
      system: [
        'You convert a business owner prompt into structured JSON.',
        'Return ONLY valid JSON with keys:',
        'business_name, business_type, owner_name, owner_email, services, staff, needs, public_features, dashboard_features.',
        'services must be array of objects: { name, price?, duration }',
        'staff, needs, public_features, dashboard_features must be arrays of strings.'
      ].join(' '),
      messages: [
        {
          role: 'user',
          content: `Owner prompt:\n${prompt}\n\nReturn only JSON.`
        }
      ]
    })
  });
  const data = await response.json();
  if (!response.ok || data?.error) {
    throw new Error(data?.error?.message || `Prompt parse failed (${response.status})`);
  }

  const rawText = (Array.isArray(data.content) ? data.content : []).map((block) => block.text || '').join('\n').trim();
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON found in prompt parse response');
  return JSON.parse(jsonMatch[0]);
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

router.post('/intake-parse', async (req, res) => {
  try {
    const { prompt } = req.body || {};
    const normalizedPrompt = String(prompt || '').trim();
    if (normalizedPrompt.length < 20) {
      return res.status(400).json({ error: 'Please provide a longer prompt with business details.' });
    }

    let parsed = null;
    try {
      parsed = await parsePromptWithClaude(normalizedPrompt);
    } catch (err) {
      console.error('Prompt parse fallback triggered:', err.message);
    }

    const businessContext = sanitizeBusinessContext(parsed || {}, normalizedPrompt);
    return res.json({
      businessContext,
      summary: {
        business_name: businessContext.business_name,
        business_type: businessContext.business_type,
        services_count: businessContext.services.length,
        staff_count: businessContext.staff.length
      }
    });
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
