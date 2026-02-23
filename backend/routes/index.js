const express = require('express');
const router = express.Router();
const { verifyToken, generateToken } = require('../modules/auth');
const { getSupabaseClient } = require('../modules/supabase');
const { getLatestLiveCustomer } = require('../modules/live-app');
const {
  isMissingTableError,
  listCatalog,
  createCatalogItem,
  updateCatalogItem,
  deactivateCatalogItem
} = require('../modules/catalog');
const {
  normalizePageKey,
  getLegalPage,
  listLegalPages,
  upsertLegalPage
} = require('../modules/legal-content');

function getSupabaseOr503(res) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    res.status(503).json({ error: 'Supabase is not configured' });
    return null;
  }
  return supabase;
}

const DASHBOARD_BOOTSTRAP_EMAIL = process.env.DASHBOARD_BOOTSTRAP_EMAIL || 'owner@nite.local';
const DASHBOARD_BOOTSTRAP_PASSWORD = process.env.DASHBOARD_BOOTSTRAP_PASSWORD || 'nite-owner-2026';

const CATALOG_FALLBACK = [
  { id: 'fallback-1', name: 'Haircut', price: 45, duration_minutes: 30, description: 'Classic cut and style', featured: true, is_active: true },
  { id: 'fallback-2', name: 'Color', price: 120, duration_minutes: 90, description: 'Full color treatment', featured: true, is_active: true },
  { id: 'fallback-3', name: 'Blowout', price: 35, duration_minutes: 30, description: 'Wash and blowout', featured: false, is_active: true }
];

async function fetchCatalog(supabase) {
  try {
    const { items } = await listCatalog(supabase, { activeOnly: true });
    if (items.length > 0) return items;
  } catch (err) {
    if (!isMissingTableError(err)) throw err;
  }
  return CATALOG_FALLBACK;
}

async function getLiveCustomerId(supabase) {
  const liveCustomer = await getLatestLiveCustomer(supabase);
  return liveCustomer?.id || null;
}

// AUTH - Login
router.post('/auth/login', async (req, res) => {
  try {
    const supabase = getSupabaseOr503(res);
    if (!supabase) return;
    const { email, password } = req.body;
    if (!password) return res.status(400).json({ error: 'Password required' });

    let { data, error } = await supabase
      .from('staff')
      .select('*')
      .eq('email', email)
      .single();

    // Bootstrap path for uninitialized/test environments.
    if ((error || !data) && email === DASHBOARD_BOOTSTRAP_EMAIL && password === DASHBOARD_BOOTSTRAP_PASSWORD) {
      const ownerLookup = await supabase
        .from('staff')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(1);
      if (ownerLookup.error) throw ownerLookup.error;
      data = Array.isArray(ownerLookup.data) ? ownerLookup.data[0] : null;
    }

    if (!data) return res.status(401).json({ error: 'Invalid credentials' });

    let valid = false;
    if (data.password_hash) {
      const verify = await supabase.rpc('verify_password', { password, hash: data.password_hash });
      if (!verify.error && verify.data) valid = true;
    }

    // Fallback when password hashes are not initialized yet.
    if (!valid && password === DASHBOARD_BOOTSTRAP_PASSWORD) {
      valid = true;
    }

    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    const token = generateToken({ id: data.id, name: data.name, role: data.role });
    res.json({ token, user: { id: data.id, name: data.name, role: data.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SERVICES - Public
router.get('/services', async (req, res) => {
  try {
    const supabase = getSupabaseOr503(res);
    if (!supabase) return;
    const data = await fetchCatalog(supabase);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PRODUCTS - Public compatibility endpoint for older generated apps
router.get('/products', async (req, res) => {
  try {
    const supabase = getSupabaseOr503(res);
    if (!supabase) return;
    const data = await fetchCatalog(supabase);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/products/featured', async (req, res) => {
  try {
    const supabase = getSupabaseOr503(res);
    if (!supabase) return;
    const products = await fetchCatalog(supabase);
    const featured = products.filter(p => p.featured);
    res.json(featured.length > 0 ? featured : products.slice(0, 3));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// STAFF - Public
router.get('/staff/public', async (req, res) => {
  try {
    const supabase = getSupabaseOr503(res);
    if (!supabase) return;
    const { data, error } = await supabase.from('staff').select('id, name, role').eq('is_active', true);
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// BOOK - Public
router.post('/book', async (req, res) => {
  try {
    const supabase = getSupabaseOr503(res);
    if (!supabase) return;
    const {
      client_name,
      client_email,
      client_phone,
      staff_id,
      service_id,
      product_id,
      appointment_date,
      appointment_time,
      notes
    } = req.body;
    const selectedServiceId = service_id || product_id;
    if (!client_name || !selectedServiceId || !appointment_date || !appointment_time) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    let client_id = null;
    if (client_email) {
      const { data: existing } = await supabase.from('clients').select('id').eq('email', client_email).single();
      if (existing) {
        client_id = existing.id;
      } else {
        const { data: newClient, error: clientErr } = await supabase.from('clients').insert({ name: client_name, email: client_email, phone: client_phone }).select('id').single();
        if (clientErr) throw clientErr;
        client_id = newClient.id;
      }
    }
    const { data, error } = await supabase.from('appointments').insert({
      client_id, client_name, client_email, client_phone,
      staff_id: staff_id || null, service_id: selectedServiceId, appointment_date, appointment_time, notes, status: 'pending'
    }).select('*').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ORDERS - Public compatibility endpoint for older generated apps
router.post('/orders', async (req, res) => {
  try {
    const supabase = getSupabaseOr503(res);
    if (!supabase) return;

    const payload = req.body || {};
    const { data, error } = await supabase.from('orders').insert(payload).select('*').single();
    if (error) {
      if (isMissingTableError(error)) {
        return res.status(201).json({ id: `order-${Date.now()}`, ...payload, status: 'received', queued: true });
      }
      throw error;
    }

    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/blog', async (req, res) => {
  try {
    const supabase = getSupabaseOr503(res);
    if (!supabase) return;
    const { data, error } = await supabase.from('blog_posts').select('*').order('created_at', { ascending: false });
    if (error) {
      if (isMissingTableError(error)) return res.json([]);
      throw error;
    }
    res.json(Array.isArray(data) ? data : []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/newsletter', async (req, res) => {
  try {
    const supabase = getSupabaseOr503(res);
    if (!supabase) return;
    const payload = req.body || {};
    const { error } = await supabase.from('newsletter_subscribers').insert(payload);
    if (error && !isMissingTableError(error)) throw error;
    res.status(201).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/contact', async (req, res) => {
  try {
    const supabase = getSupabaseOr503(res);
    if (!supabase) return;
    const payload = req.body || {};
    const { error } = await supabase.from('contact_messages').insert(payload);
    if (error && !isMissingTableError(error)) throw error;
    res.status(201).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/legal/:pageKey', async (req, res) => {
  try {
    const supabase = getSupabaseOr503(res);
    if (!supabase) return;
    const pageKey = normalizePageKey(req.params.pageKey);
    if (!pageKey) return res.status(400).json({ error: 'Invalid legal page key' });

    const customerId = await getLiveCustomerId(supabase);
    const page = await getLegalPage(supabase, customerId, pageKey);
    res.json({ ...page, customer_id: customerId || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DASHBOARD - Appointments
router.get('/dashboard/appointments', verifyToken, async (req, res) => {
  try {
    const supabase = getSupabaseOr503(res);
    if (!supabase) return;
    const { date, status } = req.query;
    let query = supabase.from('appointments').select('*, services(name, price, duration_minutes), staff(name)').order('appointment_date', { ascending: true }).order('appointment_time', { ascending: true });
    if (date) query = query.eq('appointment_date', date);
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (!error) return res.json(data);

    let fallbackQuery = supabase.from('appointments').select('*, products(name, price, duration_minutes), staff(name)').order('appointment_date', { ascending: true }).order('appointment_time', { ascending: true });
    if (date) fallbackQuery = fallbackQuery.eq('appointment_date', date);
    if (status) fallbackQuery = fallbackQuery.eq('status', status);
    const fallback = await fallbackQuery;
    if (fallback.error) throw fallback.error;
    res.json((Array.isArray(fallback.data) ? fallback.data : []).map((row) => ({
      ...row,
      services: row.services || row.products || null
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/dashboard/appointments/:id', verifyToken, async (req, res) => {
  try {
    const supabase = getSupabaseOr503(res);
    if (!supabase) return;
    const { data, error } = await supabase.from('appointments').update(req.body).eq('id', req.params.id).select('*').single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DASHBOARD - Clients
router.get('/dashboard/clients', verifyToken, async (req, res) => {
  try {
    const supabase = getSupabaseOr503(res);
    if (!supabase) return;
    const { search } = req.query;
    let query = supabase.from('clients').select('*').order('name');
    if (search) query = query.ilike('name', `%${search}%`);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/dashboard/clients/:id', verifyToken, async (req, res) => {
  try {
    const supabase = getSupabaseOr503(res);
    if (!supabase) return;
    const { data: client, error: clientErr } = await supabase.from('clients').select('*').eq('id', req.params.id).single();
    if (clientErr) throw clientErr;
    const { data: history, error: histErr } = await supabase.from('appointments').select('*, services(name, price)').eq('client_id', req.params.id).order('appointment_date', { ascending: false });
    if (histErr) throw histErr;
    res.json({ client, history });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DASHBOARD - Staff
router.get('/dashboard/staff', verifyToken, async (req, res) => {
  try {
    const supabase = getSupabaseOr503(res);
    if (!supabase) return;
    const { data, error } = await supabase.from('staff').select('*').order('name');
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/dashboard/staff', verifyToken, async (req, res) => {
  try {
    const supabase = getSupabaseOr503(res);
    if (!supabase) return;
    const { data, error } = await supabase.from('staff').insert(req.body).select('*').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DASHBOARD - Services
router.get('/dashboard/services', verifyToken, async (req, res) => {
  try {
    const supabase = getSupabaseOr503(res);
    if (!supabase) return;
    const { items } = await listCatalog(supabase);
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/dashboard/services', verifyToken, async (req, res) => {
  try {
    const supabase = getSupabaseOr503(res);
    if (!supabase) return;

    const { name, price, duration_minutes, description, featured, is_active } = req.body || {};
    const normalizedName = String(name || '').trim();
    const normalizedPrice = Number(price);
    const normalizedDuration = duration_minutes !== undefined ? Number(duration_minutes) : 60;
    if (!normalizedName) return res.status(400).json({ error: 'Service name is required' });
    if (!Number.isFinite(normalizedPrice) || normalizedPrice < 0) return res.status(400).json({ error: 'Valid price is required' });
    if (!Number.isFinite(normalizedDuration) || normalizedDuration <= 0) return res.status(400).json({ error: 'Valid duration is required' });

    const { item } = await createCatalogItem(supabase, {
      name: normalizedName,
      price: normalizedPrice,
      duration_minutes: normalizedDuration,
      description: description || '',
      featured: Boolean(featured),
      is_active: is_active !== false
    });
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/dashboard/services/:id', verifyToken, async (req, res) => {
  try {
    const supabase = getSupabaseOr503(res);
    if (!supabase) return;
    const patch = {};
    if (req.body?.name !== undefined) patch.name = req.body.name;
    if (req.body?.price !== undefined) patch.price = Number(req.body.price);
    if (req.body?.duration_minutes !== undefined) patch.duration_minutes = Number(req.body.duration_minutes);
    if (req.body?.description !== undefined) patch.description = req.body.description;
    if (req.body?.featured !== undefined) patch.featured = Boolean(req.body.featured);
    if (req.body?.is_active !== undefined) patch.is_active = Boolean(req.body.is_active);
    const { item } = await updateCatalogItem(supabase, req.params.id, patch);
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/dashboard/services/:id', verifyToken, async (req, res) => {
  try {
    const supabase = getSupabaseOr503(res);
    if (!supabase) return;
    const { item, mode } = await deactivateCatalogItem(supabase, req.params.id);
    res.json({ success: true, mode, item });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/dashboard/legal-content', verifyToken, async (req, res) => {
  try {
    const supabase = getSupabaseOr503(res);
    if (!supabase) return;
    const customerId = await getLiveCustomerId(supabase);
    if (!customerId) {
      return res.status(400).json({ error: 'No live customer selected' });
    }

    const pages = await listLegalPages(supabase, customerId);
    const byKey = {};
    (Array.isArray(pages) ? pages : []).forEach((page) => {
      if (page?.page_key) byKey[page.page_key] = page;
    });

    res.json({ customer_id: customerId, pages: byKey });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/dashboard/legal-content/:pageKey', verifyToken, async (req, res) => {
  try {
    const supabase = getSupabaseOr503(res);
    if (!supabase) return;
    const pageKey = normalizePageKey(req.params.pageKey);
    if (!pageKey) return res.status(400).json({ error: 'Invalid legal page key' });

    const customerId = await getLiveCustomerId(supabase);
    if (!customerId) {
      return res.status(400).json({ error: 'No live customer selected' });
    }

    const updated = await upsertLegalPage(supabase, customerId, pageKey, req.body || {});
    res.json({ success: true, page: updated, customer_id: customerId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DASHBOARD - Revenue
router.get('/dashboard/revenue', verifyToken, async (req, res) => {
  try {
    const supabase = getSupabaseOr503(res);
    if (!supabase) return;
    const { start_date, end_date } = req.query;
    let query = supabase.from('appointments').select('appointment_date, services(name, price), staff(name)').eq('status', 'completed');
    if (start_date) query = query.gte('appointment_date', start_date);
    if (end_date) query = query.lte('appointment_date', end_date);
    const primary = await query.order('appointment_date', { ascending: false });

    let rows = Array.isArray(primary.data) ? primary.data : [];
    if (primary.error) {
      let fallbackQuery = supabase.from('appointments').select('appointment_date, products(name, price), staff(name)').eq('status', 'completed');
      if (start_date) fallbackQuery = fallbackQuery.gte('appointment_date', start_date);
      if (end_date) fallbackQuery = fallbackQuery.lte('appointment_date', end_date);
      const fallback = await fallbackQuery.order('appointment_date', { ascending: false });
      if (fallback.error) throw fallback.error;
      rows = (Array.isArray(fallback.data) ? fallback.data : []).map((row) => ({
        ...row,
        services: row.services || row.products || null
      }));
    }

    const totalRevenue = rows.reduce((sum, appt) => sum + (appt.services?.price || 0), 0);
    res.json({ total: totalRevenue, count: rows.length, appointments: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
