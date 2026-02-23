const { generateApp } = require('./generate');
const { createClient } = require('@supabase/supabase-js');
const { randomUUID } = require('crypto');

let buildStatus = { status: 'idle', queueDepth: 0 };
const buildQueue = [];
let activeBuild = null;
let isProcessing = false;

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
}

async function updateCustomerAppStatus(customerId, appStatus) {
  if (!customerId) return;
  try {
    const supabase = getSupabase();
    const { error } = await supabase
      .from('customers')
      .update({ app_status: appStatus })
      .eq('id', customerId);
    if (error) {
      console.error(`Failed to update customer ${customerId} app_status to ${appStatus}:`, error.message);
    }
  } catch (err) {
    console.error(`Error updating customer ${customerId} app_status to ${appStatus}:`, err.message);
  }
}

function refreshBuildStatus(partial = {}) {
  buildStatus = {
    ...buildStatus,
    ...partial,
    activeBuildId: activeBuild?.buildId || null,
    activeCustomerId: activeBuild?.customerId || null,
    queueDepth: buildQueue.length
  };
}

async function orchestrate(businessContext, customerId) {
  const job = {
    buildId: randomUUID(),
    businessContext,
    customerId: customerId || null,
    queuedAt: new Date().toISOString()
  };
  buildQueue.push(job);

  const nextStatus = activeBuild || isProcessing ? 'queued' : 'generating';
  await updateCustomerAppStatus(job.customerId, nextStatus);
  refreshBuildStatus({
    status: nextStatus,
    buildId: job.buildId,
    customerId: job.customerId,
    queuedAt: job.queuedAt,
    error: null
  });

  processQueue().catch((error) => {
    console.error('Build queue processor error:', error.message);
  });

  return {
    success: true,
    buildId: job.buildId,
    status: nextStatus,
    message: nextStatus === 'queued'
      ? 'Build queued. Check /admin/build-status for progress.'
      : 'Build started. Check /admin/build-status for progress.'
  };
}

async function processQueue() {
  if (isProcessing) return;
  isProcessing = true;

  while (buildQueue.length > 0) {
    const job = buildQueue.shift();
    activeBuild = job;

    try {
      refreshBuildStatus({
        status: 'generating',
        buildId: job.buildId,
        customerId: job.customerId,
        startedAt: new Date().toISOString(),
        error: null
      });
      await updateCustomerAppStatus(job.customerId, 'generating');

      const files = await generateApp(job.businessContext, job.customerId);
      await updateCustomerAppStatus(job.customerId, 'live');
      refreshBuildStatus({
        status: 'complete',
        buildId: job.buildId,
        customerId: job.customerId,
        files: files.length,
        completedAt: new Date().toISOString(),
        error: null
      });
      console.log(`Build complete: ${files.length} files generated and saved`);
    } catch (error) {
      console.error('Build error:', error.message);
      await updateCustomerAppStatus(job.customerId, 'error');
      refreshBuildStatus({
        status: 'error',
        buildId: job.buildId,
        customerId: job.customerId,
        error: error.message,
        completedAt: new Date().toISOString()
      });
    } finally {
      activeBuild = null;
      refreshBuildStatus({ status: buildStatus.status });
    }
  }

  isProcessing = false;
}

function getBuildStatus() {
  return buildStatus;
}

module.exports = { orchestrate, getBuildStatus };
