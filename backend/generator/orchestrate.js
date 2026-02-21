const { generateApp } = require('./generate');

let buildStatus = { status: 'idle' };

async function orchestrate(businessContext, customerId) {
  buildStatus = { status: 'generating', startedAt: new Date().toISOString() };
  runBuild(businessContext, customerId);
  return { success: true, message: 'Build started. Check /admin/build-status for progress.' };
}

async function runBuild(businessContext, customerId) {
  try {
    buildStatus = { status: 'generating' };
    const files = await generateApp(businessContext, customerId);
    buildStatus = { status: 'complete', files: files.length, completedAt: new Date().toISOString() };
    console.log(`Build complete: ${files.length} files generated and saved`);
  } catch (error) {
    console.error('Build error:', error.message);
    buildStatus = { status: 'error', error: error.message };
  }
}

function getBuildStatus() {
  return buildStatus;
}

module.exports = { orchestrate, getBuildStatus };
