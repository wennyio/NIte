async function getLatestLiveCustomer(supabase) {
  try {
    const { data, error } = await supabase
      .from('customers')
      .select('id, business_name, subdomain, app_status')
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

async function getLiveAppFiles(supabase, fileTypes = ['source', 'compiled']) {
  const liveCustomer = await getLatestLiveCustomer(supabase);

  if (liveCustomer?.id) {
    const liveRows = await supabase
      .from('generated_apps')
      .select('file_path, file_content, file_type')
      .eq('customer_id', liveCustomer.id)
      .in('file_type', fileTypes);

    if (!liveRows.error && Array.isArray(liveRows.data) && liveRows.data.length > 0) {
      return {
        files: liveRows.data,
        customerId: liveCustomer.id,
        source: 'live-customer',
        liveCustomer
      };
    }
  }

  const fallbackRows = await supabase
    .from('generated_apps')
    .select('file_path, file_content, file_type')
    .is('customer_id', null)
    .in('file_type', fileTypes);

  if (fallbackRows.error) throw fallbackRows.error;

  return {
    files: fallbackRows.data || [],
    customerId: null,
    source: 'global-null',
    liveCustomer
  };
}

module.exports = { getLatestLiveCustomer, getLiveAppFiles };
