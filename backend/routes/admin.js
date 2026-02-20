const express = require('express');
const router = express.Router();
const { orchestrate, getBuildStatus } = require('../generator/orchestrate');

router.post('/generate', async (req, res) => {
  try {
    const { businessContext } = req.body;
    if (!businessContext || !businessContext.business_type || !businessContext.business_name) {
      return res.status(400).json({ error: 'Missing business context' });
    }
    const result = await orchestrate(businessContext);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/test-generate', async (req, res) => {
  const testContext = {
    business_type: 'salon',
    business_name: 'Luxe Studio',
    owner_name: 'Sarah',
    staff: ['owner', '2 stylists'],
    services: [
      { name: 'Haircut', price: 45, duration: '30 min' },
      { name: 'Color', price: 120, duration: '90 min' },
      { name: 'Blowout', price: 35, duration: '20 min' }
    ],
    needs: ['appointments', 'client history', 'revenue tracking', 'staff schedules'],
    public_features: ['booking page', 'service menu', 'contact info'],
    dashboard_features: ['appointment management', 'client profiles', 'revenue dashboard', 'staff management']
  };

  try {
    const result = await orchestrate(testContext);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/build-status', (req, res) => {
  res.json(getBuildStatus());
});

module.exports = router;
