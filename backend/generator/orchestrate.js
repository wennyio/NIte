const { generateApp } = require('./generate');
const { execSync } = require('child_process');
const path = require('path');

let buildStatus = { status: 'idle' };

async function orchestrate(businessContext) {
  buildStatus = { status: 'generating', startedAt: new Date().toISOString() };
  runBuild(businessContext);
  return { success: true, message: 'Build started. Check /admin/build-status for progress.' };
}

async function runBuild(businessContext) {
  try {
    const outputDir = path.join(__dirname, '../../');
    const results = await generateApp(businessContext, outputDir);
    buildStatus = { status: 'rebuilding', files: results.length };

    execSync('npm run build --prefix frontend', {
      cwd: outputDir,
      stdio: 'inherit'
    });

    // Clear Node's require cache for generated routes so they reload
    const routesPath = require.resolve('../routes/index');
    delete require.cache[routesPath];

    buildStatus = { status: 'complete', files: results.length, completedAt: new Date().toISOString() };
    console.log('Build complete — app is live');

  } catch (error) {
    console.error('Build error:', error.message);
    buildStatus = { status: 'error', error: error.message };
  }
}

function getBuildStatus() {
  return buildStatus;
}

module.exports = { orchestrate, getBuildStatus };
