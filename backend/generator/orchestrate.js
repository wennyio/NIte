const { generateApp } = require('./generate');
const path = require('path');

async function orchestrate(businessContext) {
  const steps = [];

  try {
    // Step 1 — Generate code
    steps.push({ step: 'generating', status: 'in_progress' });
    const outputDir = path.join(__dirname, '../../');
    const results = await generateApp(businessContext, outputDir);
    steps.push({ step: 'generating', status: 'complete', files: results.length });

    // Step 2 — Code is written to container
    steps.push({ step: 'deploying', status: 'complete' });

    return { success: true, steps };

  } catch (error) {
    steps.push({ step: 'error', message: error.message });
    return { success: false, steps, error: error.message };
  }
}

module.exports = { orchestrate };
