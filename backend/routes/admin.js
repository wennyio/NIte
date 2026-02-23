const express = require('express');
const router = express.Router();
const { orchestrate, getBuildStatus } = require('../generator/orchestrate');
const { getSupabaseClient } = require('../modules/supabase');

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
  if (appStatus === 'error') return 'error';
  if (appStatus === 'generating') return 'generating';
  if (appStatus === 'queued') return 'queued';
  return 'idle';
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

// Create customer from intake
router.post('/customers', async (req, res) => {
  try {
    const supabase = getSupabaseOr503(res);
    if (!supabase) return;
    const { business_name, business_type, owner_name, owner_email } = req.body;
    if (!business_name || !owner_email) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const subdomain = business_name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
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
      return res.json({
        status: mapAppStatusToBuildStatus(data.app_status),
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

    res.json({ success: true, customer: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
