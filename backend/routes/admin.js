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

module.exports = router;
