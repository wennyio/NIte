async function getLatestLiveCustomer(supabase) {
  try {
    const { data, error } = await supabase
      .from('customers')
      .select('id, business_name, subdomain, app_status, tier, status, container_url')
      .eq('app_status', 'live')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return null;
    }
    return data || null;
  } catch {
    return null;
  }
}

async function getAppFilesForCustomer(supabase, customerId, fileTypes = ['source', 'compiled']) {
  if (!customerId) {
    return { files: [], source: 'missing-customer-id', customerId: null };
  }
  const rows = await supabase
    .from('generated_apps')
    .select('file_path, file_content, file_type')
    .eq('customer_id', customerId)
    .in('file_type', fileTypes);
  if (rows.error) throw rows.error;

  return {
    files: Array.isArray(rows.data) ? rows.data : [],
    source: 'customer',
    customerId
  };
}

async function getGlobalAppFiles(supabase, fileTypes = ['source', 'compiled']) {
  const rows = await supabase
    .from('generated_apps')
    .select('file_path, file_content, file_type')
    .is('customer_id', null)
    .in('file_type', fileTypes);

  if (rows.error) throw rows.error;
  return {
    files: Array.isArray(rows.data) ? rows.data : [],
    source: 'global-null',
    customerId: null
  };
}

async function countAppFiles(supabase, customerId) {
  const [sourceRes, compiledRes] = await Promise.all([
    supabase
      .from('generated_apps')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', customerId)
      .eq('file_type', 'source'),
    supabase
      .from('generated_apps')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', customerId)
      .eq('file_type', 'compiled')
  ]);

  if (sourceRes.error) throw sourceRes.error;
  if (compiledRes.error) throw compiledRes.error;

  return {
    source: sourceRes.count || 0,
    compiled: compiledRes.count || 0
  };
}

async function getLiveAppFiles(supabase, fileTypes = ['source', 'compiled'], options = {}) {
  const { allowGlobalFallback = true } = options;
  const liveCustomer = await getLatestLiveCustomer(supabase);

  if (liveCustomer?.id) {
    const liveRows = await getAppFilesForCustomer(supabase, liveCustomer.id, fileTypes);
    if (liveRows.files.length > 0) {
      return {
        files: liveRows.files,
        customerId: liveCustomer.id,
        source: 'live-customer',
        liveCustomer
      };
    }
    if (!allowGlobalFallback) {
      return {
        files: [],
        customerId: liveCustomer.id,
        source: 'live-customer-empty',
        liveCustomer
      };
    }
  }

  const fallbackRows = await getGlobalAppFiles(supabase, fileTypes);

  return {
    files: fallbackRows.files,
    customerId: null,
    source: 'global-null',
    liveCustomer
  };
}

module.exports = {
  getLatestLiveCustomer,
  getLiveAppFiles,
  getAppFilesForCustomer,
  getGlobalAppFiles,
  countAppFiles
};
