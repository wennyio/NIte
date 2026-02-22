const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { orchestrate, getBuildStatus } = require('../generator/orchestrate');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Get all customers for command center
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
