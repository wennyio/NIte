const { generateApp } = require('./generate');
const { createClient } = require('@supabase/supabase-js');

let buildStatus = { status: 'idle' };

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

async function orchestrate(businessContext, customerId) {
  buildStatus = {
    status: 'generating',
    customerId: customerId || null,
    startedAt: new Date().toISOString()
  };
  await updateCustomerAppStatus(customerId, 'generating');
  runBuild(businessContext, customerId);
  return { success: true, message: 'Build started. Check /admin/build-status for progress.' };
}

async function runBuild(businessContext, customerId) {
  try {
    buildStatus = { status: 'generating', customerId: customerId || null };
    const files = await generateApp(businessContext, customerId);
    buildStatus = {
      status: 'complete',
      customerId: customerId || null,
      files: files.length,
      completedAt: new Date().toISOString()
    };
    await updateCustomerAppStatus(customerId, 'live');
    console.log(`Build complete: ${files.length} files generated and saved`);
  } catch (error) {
    console.error('Build error:', error.message);
    buildStatus = {
      status: 'error',
      customerId: customerId || null,
      error: error.message
    };
    await updateCustomerAppStatus(customerId, 'error');
  }
}

function getBuildStatus() {
  return buildStatus;
}

module.exports = { orchestrate, getBuildStatus };
