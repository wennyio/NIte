const express = require('express');
const router = express.Router();
const { orchestrate } = require('../generator/orchestrate');

router.post('/generate', async (req, res) => {
  try {
    const { businessContext } = req.body;

    if (!businessContext || !businessContext.business_type || !businessContext.business_name) {
      return res.status(400).json({ error: 'Missing business context' });
    }

    console.log(`Generating app for: ${businessContext.business_name}`);

    const result = await orchestrate(businessContext);

    if (result.success) {
      res.json({ message: 'App generated successfully', steps: result.steps });
    } else {
      res.status(500).json({ error: result.error, steps: result.steps });
    }

  } catch (err) {
    console.error('Generation failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Test route — triggers a salon generation
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
    console.log('Test generation starting...');
    const result = await orchestrate(testContext);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
