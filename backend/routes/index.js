const express = require('express');
const router = express.Router();
const { verifyToken, generateToken } = require('../modules/auth');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// AUTH - Login
router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const { data, error } = await supabase
      .from('staff')
      .select('*')
      .eq('email', email)
      .single();
    if (error || !data) return res.status(401).json({ error: 'Invalid credentials' });
    const { data: valid } = await supabase
      .rpc('verify_password', { password, hash: data.password_hash });
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
    const { data, error } = await supabase.from('services').select('*').eq('is_active', true).order('price', { ascending: true });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// STAFF - Public
router.get('/staff/public', async (req, res) => {
  try {
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
    const { client_name, client_email, client_phone, staff_id, service_id, appointment_date, appointment_time, notes } = req.body;
    if (!client_name || !service_id || !appointment_date || !appointment_time) {
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
      staff_id: staff_id || null, service_id, appointment_date, appointment_time, notes, status: 'pending'
    }).select('*').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DASHBOARD - Appointments
router.get('/dashboard/appointments', verifyToken, async (req, res) => {
  try {
    const { date, status } = req.query;
    let query = supabase.from('appointments').select('*, services(name, price, duration_minutes), staff(name)').order('appointment_date', { ascending: true }).order('appointment_time', { ascending: true });
    if (date) query = query.eq('appointment_date', date);
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/dashboard/appointments/:id', verifyToken, async (req, res) => {
  try {
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
    const { data, error } = await supabase.from('staff').select('*').order('name');
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/dashboard/staff', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase.from('staff').insert(req.body).select('*').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DASHBOARD - Revenue
router.get('/dashboard/revenue', verifyToken, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    let query = supabase.from('appointments').select('appointment_date, services(name, price), staff(name)').eq('status', 'completed');
    if (start_date) query = query.gte('appointment_date', start_date);
    if (end_date) query = query.lte('appointment_date', end_date);
    const { data, error } = await query.order('appointment_date', { ascending: false });
    if (error) throw error;
    const totalRevenue = data.reduce((sum, appt) => sum + (appt.services?.price || 0), 0);
    res.json({ total: totalRevenue, count: data.length, appointments: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
