const { createClient } = require('@supabase/supabase-js');

let cachedClient = null;
let configErrorLogged = false;
let clientInitErrorLogged = false;

function getSupabaseClient() {
  if (cachedClient) return cachedClient;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    if (!configErrorLogged) {
      console.error('Supabase env vars missing: SUPABASE_URL and/or SUPABASE_SERVICE_KEY');
      configErrorLogged = true;
    }
    return null;
  }

  try {
    cachedClient = createClient(supabaseUrl, supabaseServiceKey);
    return cachedClient;
  } catch (err) {
    if (!clientInitErrorLogged) {
      console.error('Failed to initialize Supabase client:', err.message);
      clientInitErrorLogged = true;
    }
    return null;
  }
}

module.exports = { getSupabaseClient };
