const { generateApp } = require('./generate');
const { getSupabaseClient } = require('../modules/supabase');
const { randomUUID } = require('crypto');

let buildStatus = { status: 'idle', queueDepth: 0 };
const buildQueue = [];
let activeBuild = null;
let isProcessing = false;

function getSupabase() {
  return getSupabaseClient();
}

async function updateCustomerAppStatus(customerId, appStatus) {
  if (!customerId) return { updated: false, reason: 'missing-customer-id' };
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase is not configured');

  const { data, error } = await supabase
    .from('customers')
    .update({ app_status: appStatus })
    .eq('id', customerId)
    .select('id')
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to update customer ${customerId} app_status to ${appStatus}: ${error.message}`);
  }
  if (!data?.id) {
    throw new Error(`Customer ${customerId} not found while setting app_status ${appStatus}`);
  }
  return { updated: true };
}

async function promoteCustomerToLive(customerId) {
  if (!customerId) throw new Error('Missing customerId for live promotion');
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase is not configured');

  const demote = await supabase
    .from('customers')
    .update({ app_status: 'pending' })
    .eq('app_status', 'live')
    .neq('id', customerId);
  if (demote.error) {
    throw new Error(`Failed to demote previous live customer(s): ${demote.error.message}`);
  }

  await updateCustomerAppStatus(customerId, 'live');
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
  try {
    await updateCustomerAppStatus(job.customerId, nextStatus);
  } catch (statusErr) {
    console.error(statusErr.message);
  }
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
      try {
        await updateCustomerAppStatus(job.customerId, 'generating');
      } catch (statusErr) {
        console.error(statusErr.message);
      }

      const files = await generateApp(job.businessContext, job.customerId);
      await promoteCustomerToLive(job.customerId);
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
      try {
        await updateCustomerAppStatus(job.customerId, 'error');
      } catch (statusErr) {
        console.error(statusErr.message);
      }
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
