import { useState, useEffect } from 'react';
import axios from 'axios';

const SALON_NAME = "Nite Salon";
const TAGLINE = "Where style meets intention";

export default function Public() {
  const [services, setServices] = useState([]);
  const [staff, setStaff] = useState([]);
  const [view, setView] = useState('home'); // home | book
  const [form, setForm] = useState({
    client_name: '', client_email: '', client_phone: '',
    staff_id: '', service_id: '', appointment_date: '', appointment_time: '', notes: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    axios.get('/api/services').then(r => setServices(r.data)).catch(() => {});
    axios.get('/api/staff/public').then(r => setStaff(r.data)).catch(() => {});
  }, []);

  const times = [
    '9:00 AM','9:30 AM','10:00 AM','10:30 AM','11:00 AM','11:30 AM',
    '12:00 PM','12:30 PM','1:00 PM','1:30 PM','2:00 PM','2:30 PM',
    '3:00 PM','3:30 PM','4:00 PM','4:30 PM','5:00 PM','5:30 PM'
  ];

  const handleBook = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await axios.post('/api/book', form);
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedService = services.find(s => s.id === form.service_id);

  return (
    <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", background: '#0a0a08', minHeight: '100vh', color: '#e8e0d4' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=Montserrat:wght@300;400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .mono { font-family: 'Montserrat', sans-serif; }
        .btn-primary { background: #c9a96e; color: #0a0a08; border: none; padding: 14px 36px; font-family: 'Montserrat', sans-serif; font-size: 11px; font-weight: 500; letter-spacing: 3px; text-transform: uppercase; cursor: pointer; transition: all 0.3s; }
        .btn-primary:hover { background: #e8c98a; }
        .btn-ghost { background: transparent; color: #c9a96e; border: 1px solid #c9a96e; padding: 13px 35px; font-family: 'Montserrat', sans-serif; font-size: 11px; font-weight: 500; letter-spacing: 3px; text-transform: uppercase; cursor: pointer; transition: all 0.3s; }
        .btn-ghost:hover { background: #c9a96e22; }
        input, select, textarea { background: #12120e; border: 1px solid #2a2a22; color: #e8e0d4; padding: 12px 16px; font-family: 'Montserrat', sans-serif; font-size: 13px; width: 100%; outline: none; transition: border 0.2s; }
        input:focus, select:focus, textarea:focus { border-color: #c9a96e; }
        select option { background: #12120e; }
        label { font-family: 'Montserrat', sans-serif; font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: #888; display: block; margin-bottom: 6px; }
        .service-card { border: 1px solid #1e1e18; padding: 28px; transition: all 0.3s; cursor: default; }
        .service-card:hover { border-color: #c9a96e44; background: #12120e; }
        .divider { width: 40px; height: 1px; background: #c9a96e; margin: 16px 0; }
        nav a { font-family: 'Montserrat', sans-serif; font-size: 11px; letter-spacing: 3px; text-transform: uppercase; color: #888; text-decoration: none; cursor: pointer; transition: color 0.2s; }
        nav a:hover, nav a.active { color: #c9a96e; }
        .fade-in { animation: fadeIn 0.6s ease forwards; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* NAV */}
      <nav style={{ padding: '24px 48px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1a1a14' }}>
        <div>
          <div style={{ fontSize: '22px', fontWeight: 300, letterSpacing: '6px', textTransform: 'uppercase' }}>{SALON_NAME}</div>
          <div style={{ fontFamily: 'Montserrat', fontSize: '9px', letterSpacing: '4px', color: '#c9a96e', marginTop: '2px' }}>{TAGLINE}</div>
        </div>
        <div style={{ display: 'flex', gap: '36px' }}>
          <a className={view === 'home' ? 'active' : ''} onClick={() => setView('home')}>Services</a>
          <a className={view === 'book' ? 'active' : ''} onClick={() => { setView('book'); setSuccess(false); }}>Book Now</a>
        </div>
      </nav>

      {view === 'home' && (
        <div className="fade-in">
          {/* HERO */}
          <div style={{ padding: '100px 48px 80px', maxWidth: '700px' }}>
            <div className="mono" style={{ fontSize: '10px', letterSpacing: '4px', color: '#c9a96e', marginBottom: '24px' }}>EST. 2026 — PREMIUM SALON</div>
            <h1 style={{ fontSize: 'clamp(42px, 6vw, 72px)', fontWeight: 300, lineHeight: 1.1, marginBottom: '24px' }}>
              Crafted for<br /><em>your story</em>
            </h1>
            <p className="mono" style={{ fontSize: '13px', color: '#888', lineHeight: 1.8, maxWidth: '480px', marginBottom: '40px' }}>
              Every appointment is a conversation. We listen, we create, we transform — with precision and care that lasts beyond the chair.
            </p>
            <button className="btn-primary" onClick={() => setView('book')}>Book an Appointment</button>
          </div>

          {/* SERVICES */}
          <div style={{ padding: '0 48px 100px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '24px', marginBottom: '48px' }}>
              <div style={{ width: '1px', height: '40px', background: '#c9a96e' }}></div>
              <div>
                <div className="mono" style={{ fontSize: '10px', letterSpacing: '4px', color: '#c9a96e' }}>OUR OFFERINGS</div>
                <h2 style={{ fontSize: '32px', fontWeight: 300 }}>Services</h2>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1px', background: '#1a1a14' }}>
              {services.length === 0 && [
                { name: 'Haircut', price: 45, duration_minutes: 45, description: 'Precision cut tailored to your face shape and lifestyle.' },
                { name: 'Color', price: 120, duration_minutes: 120, description: 'Full color, highlights, or balayage — your vision brought to life.' },
                { name: 'Blowout', price: 35, duration_minutes: 30, description: 'Smooth, voluminous, and polished. Ready for anything.' },
              ].map((s, i) => (
                <div key={i} className="service-card" style={{ background: '#0a0a08' }}>
                  <div style={{ fontSize: '20px', fontWeight: 300, marginBottom: '8px' }}>{s.name}</div>
                  <div className="divider"></div>
                  <div className="mono" style={{ fontSize: '12px', color: '#888', lineHeight: 1.7, marginBottom: '20px' }}>{s.description}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <div style={{ fontSize: '28px', fontWeight: 300, color: '#c9a96e' }}>${s.price}</div>
                    <div className="mono" style={{ fontSize: '10px', color: '#555', letterSpacing: '1px' }}>{s.duration_minutes} min</div>
                  </div>
                </div>
              ))}
              {services.map(s => (
                <div key={s.id} className="service-card" style={{ background: '#0a0a08' }}>
                  <div style={{ fontSize: '20px', fontWeight: 300, marginBottom: '8px' }}>{s.name}</div>
                  <div className="divider"></div>
                  <div className="mono" style={{ fontSize: '12px', color: '#888', lineHeight: 1.7, marginBottom: '20px' }}>{s.description || 'Professional service tailored to you.'}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <div style={{ fontSize: '28px', fontWeight: 300, color: '#c9a96e' }}>${s.price}</div>
                    <div className="mono" style={{ fontSize: '10px', color: '#555', letterSpacing: '1px' }}>{s.duration_minutes} min</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* CTA STRIP */}
          <div style={{ borderTop: '1px solid #1a1a14', padding: '60px 48px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ fontSize: '28px', fontWeight: 300 }}>Ready to transform?</h3>
              <div className="mono" style={{ fontSize: '11px', color: '#888', marginTop: '8px' }}>Appointments available 7 days a week</div>
            </div>
            <button className="btn-ghost" onClick={() => setView('book')}>Reserve Your Time</button>
          </div>
        </div>
      )}

      {view === 'book' && (
        <div className="fade-in" style={{ maxWidth: '680px', margin: '0 auto', padding: '60px 48px 100px' }}>
          {success ? (
            <div style={{ textAlign: 'center', padding: '80px 0' }}>
              <div style={{ fontSize: '48px', marginBottom: '24px' }}>✦</div>
              <h2 style={{ fontSize: '36px', fontWeight: 300, marginBottom: '16px' }}>You're confirmed</h2>
              <div className="mono" style={{ fontSize: '13px', color: '#888', lineHeight: 1.8, marginBottom: '40px' }}>
                We'll see you soon. Check your email for details.
              </div>
              <button className="btn-ghost" onClick={() => { setSuccess(false); setForm({ client_name:'',client_email:'',client_phone:'',staff_id:'',service_id:'',appointment_date:'',appointment_time:'',notes:'' }); }}>Book Another</button>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: '48px' }}>
                <div className="mono" style={{ fontSize: '10px', letterSpacing: '4px', color: '#c9a96e', marginBottom: '12px' }}>RESERVATIONS</div>
                <h2 style={{ fontSize: '40px', fontWeight: 300 }}>Book Your Visit</h2>
              </div>

              <form onSubmit={handleBook} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label>Your Name *</label>
                    <input required value={form.client_name} onChange={e => setForm({...form, client_name: e.target.value})} placeholder="Full name" />
                  </div>
                  <div>
                    <label>Phone</label>
                    <input value={form.client_phone} onChange={e => setForm({...form, client_phone: e.target.value})} placeholder="(555) 000-0000" />
                  </div>
                </div>

                <div>
                  <label>Email</label>
                  <input type="email" value={form.client_email} onChange={e => setForm({...form, client_email: e.target.value})} placeholder="your@email.com" />
                </div>

                <div>
                  <label>Service *</label>
                  <select required value={form.service_id} onChange={e => setForm({...form, service_id: e.target.value})}>
                    <option value="">Select a service</option>
                    {services.map(s => <option key={s.id} value={s.id}>{s.name} — ${s.price} ({s.duration_minutes} min)</option>)}
                  </select>
                </div>

                {staff.length > 0 && (
                  <div>
                    <label>Stylist (optional)</label>
                    <select value={form.staff_id} onChange={e => setForm({...form, staff_id: e.target.value})}>
                      <option value="">No preference</option>
                      {staff.map(s => <option key={s.id} value={s.id}>{s.name} — {s.role}</option>)}
                    </select>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label>Date *</label>
                    <input type="date" required value={form.appointment_date} min={new Date().toISOString().split('T')[0]} onChange={e => setForm({...form, appointment_date: e.target.value})} />
                  </div>
                  <div>
                    <label>Time *</label>
                    <select required value={form.appointment_time} onChange={e => setForm({...form, appointment_time: e.target.value})}>
                      <option value="">Select time</option>
                      {times.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label>Notes</label>
                  <textarea rows={3} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Anything we should know? (hair history, preferences, etc.)" style={{ resize: 'vertical' }} />
                </div>

                {selectedService && (
                  <div style={{ border: '1px solid #2a2a22', padding: '20px', background: '#12120e' }}>
                    <div className="mono" style={{ fontSize: '10px', letterSpacing: '2px', color: '#c9a96e', marginBottom: '8px' }}>SUMMARY</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{selectedService.name}</span>
                      <span style={{ color: '#c9a96e' }}>${selectedService.price}</span>
                    </div>
                    {form.appointment_date && form.appointment_time && (
                      <div className="mono" style={{ fontSize: '11px', color: '#666', marginTop: '6px' }}>
                        {new Date(form.appointment_date + 'T12:00:00').toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' })} at {form.appointment_time}
                      </div>
                    )}
                  </div>
                )}

                {error && <div className="mono" style={{ fontSize: '12px', color: '#e07070', padding: '12px 16px', border: '1px solid #e0707044' }}>{error}</div>}

                <button type="submit" className="btn-primary" disabled={submitting} style={{ marginTop: '8px', opacity: submitting ? 0.7 : 1 }}>
                  {submitting ? 'Confirming...' : 'Confirm Appointment'}
                </button>
              </form>
            </>
          )}
        </div>
      )}

      {/* FOOTER */}
      <div style={{ borderTop: '1px solid #1a1a14', padding: '32px 48px', display: 'flex', justifyContent: 'space-between' }}>
        <div className="mono" style={{ fontSize: '10px', color: '#444', letterSpacing: '2px' }}>{SALON_NAME.toUpperCase()} © 2026</div>
        <div className="mono" style={{ fontSize: '10px', color: '#444', letterSpacing: '2px' }}>POWERED BY NITE</div>
      </div>
    </div>
  );
}
