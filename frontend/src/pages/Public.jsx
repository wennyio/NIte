import { useState, useEffect } from 'react';
import axios from 'axios';

export default function Public() {
  const [services, setServices] = useState([]);
  const [staff, setStaff] = useState([]);
  const [activeSection, setActiveSection] = useState('home');
  const [form, setForm] = useState({
    client_name: '', client_email: '', client_phone: '',
    service_id: '', staff_id: '', appointment_date: '', appointment_time: '', notes: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [svcRes, staffRes] = await Promise.all([
          axios.get('/api/services'),
          axios.get('/api/staff/public')
        ]);
        setServices(svcRes.data);
        setStaff(staffRes.data);
      } catch (err) { console.error(err); }
    };
    fetchData();
  }, []);

  const timeSlots = [];
  for (let h = 9; h < 18; h++) {
    timeSlots.push(`${String(h).padStart(2, '0')}:00`);
    timeSlots.push(`${String(h).padStart(2, '0')}:30`);
  }
  const today = new Date().toISOString().split('T')[0];
  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true); setError(''); setSuccess(false);
    try {
      await axios.post('/api/book', form);
      setSuccess(true);
      setForm({ client_name: '', client_email: '', client_phone: '', service_id: '', staff_id: '', appointment_date: '', appointment_time: '', notes: '' });
    } catch (err) {
      setError(err.response?.data?.error || 'Booking failed.');
    } finally { setSubmitting(false); }
  };

  return (
    <div>
      <nav>
        <button onClick={() => setActiveSection('home')}>Home</button>
        <button onClick={() => setActiveSection('book')}>Book</button>
        <button onClick={() => setActiveSection('services')}>Services</button>
      </nav>
      {activeSection === 'home' && <div><h1>Welcome</h1></div>}
      {activeSection === 'services' && (
        <div>
          <h2>Services</h2>
          {services.map(s => (
            <div key={s.id}><strong>{s.name}</strong> — ${s.price} ({s.duration_minutes} min)<p>{s.description}</p></div>
          ))}
        </div>
      )}
      {activeSection === 'book' && (
        <form onSubmit={handleSubmit}>
          <h2>Book an Appointment</h2>
          {success && <p>Booking confirmed!</p>}
          {error && <p>{error}</p>}
          <input name="client_name" placeholder="Your Name" value={form.client_name} onChange={handleChange} required />
          <input name="client_email" placeholder="Email" value={form.client_email} onChange={handleChange} />
          <input name="client_phone" placeholder="Phone" value={form.client_phone} onChange={handleChange} />
          <select name="service_id" value={form.service_id} onChange={handleChange} required>
            <option value="">Select Service</option>
            {services.map(s => <option key={s.id} value={s.id}>{s.name} — ${s.price}</option>)}
          </select>
          <select name="staff_id" value={form.staff_id} onChange={handleChange}>
            <option value="">Any Stylist</option>
            {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input type="date" name="appointment_date" value={form.appointment_date} min={today} onChange={handleChange} required />
          <select name="appointment_time" value={form.appointment_time} onChange={handleChange} required>
            <option value="">Select Time</option>
            {timeSlots.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <textarea name="notes" placeholder="Notes" value={form.notes} onChange={handleChange} />
          <button type="submit" disabled={submitting}>{submitting ? 'Booking...' : 'Book Appointment'}</button>
        </form>
      )}
    </div>
  );
}
