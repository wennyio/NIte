const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { orchestrate, getBuildStatus } = require('../generator/orchestrate');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Get all customers
router.get('/customers', async (req, res) => {
  try {
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
        app_status: 'generating',
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
router.get('/build-status', (req, res) => {
  res.json(getBuildStatus());
});

router.get('/ping', (req, res) => res.json({ ping: 'pong' }));

module.exports = router;
