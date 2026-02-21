import { useState, useEffect } from 'react';
import axios from 'axios';

const TOKEN_KEY = 'nite_token';

export default function Dashboard() {
  const [token, setToken] = useState(localStorage.getItem(TOKEN_KEY) || '');
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [tab, setTab] = useState('appointments');
  const [appointments, setAppointments] = useState([]);
  const [clients, setClients] = useState([]);
  const [staff, setStaff] = useState([]);
  const [revenue, setRevenue] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dateFilter, setDateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [clientSearch, setClientSearch] = useState('');

  const api = (url, opts = {}) => axios({ url, ...opts, headers: { Authorization: `Bearer ${token}`, ...opts.headers } });

  const login = async (e) => {
    e.preventDefault();
    setLoginError('');
    try {
      const r = await axios.post('/api/auth/login', loginForm);
      const t = r.data.token;
      setToken(t);
      localStorage.setItem(TOKEN_KEY, t);
    } catch {
      setLoginError('Invalid credentials');
    }
  };

  const logout = () => { setToken(''); localStorage.removeItem(TOKEN_KEY); };

  useEffect(() => {
    if (!token) return;
    fetchTab(tab);
  }, [token, tab]);

  const fetchTab = async (t) => {
    setLoading(true);
    try {
      if (t === 'appointments') {
        const params = {};
        if (dateFilter) params.date = dateFilter;
        if (statusFilter) params.status = statusFilter;
        const r = await api('/api/dashboard/appointments', { params });
        setAppointments(r.data);
      } else if (t === 'clients') {
        const r = await api('/api/dashboard/clients', { params: clientSearch ? { search: clientSearch } : {} });
        setClients(r.data);
      } else if (t === 'staff') {
        const r = await api('/api/dashboard/staff');
        setStaff(r.data);
      } else if (t === 'revenue') {
        const r = await api('/api/dashboard/revenue');
        setRevenue(r.data);
      }
    } catch { }
    setLoading(false);
  };

  const updateStatus = async (id, status) => {
    try {
      await api(`/api/dashboard/appointments/${id}`, { method: 'PATCH', data: { status } });
      setAppointments(prev => prev.map(a => a.id === id ? { ...a, status } : a));
    } catch { }
  };

  const statusColor = (s) => ({
    pending: '#c9a96e', confirmed: '#6ec9a9', completed: '#888', cancelled: '#e07070'
  })[s] || '#888';

  if (!token) return (
    <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", background: '#0a0a08', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e8e0d4' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400&family=Montserrat:wght@300;400;500&display=swap'); * { box-sizing:border-box; } input { background:#12120e; border:1px solid #2a2a22; color:#e8e0d4; padding:12px 16px; font-family:'Montserrat',sans-serif; font-size:13px; width:100%; outline:none; transition:border 0.2s; } input:focus { border-color:#c9a96e; } .mono { font-family:'Montserrat',sans-serif; }`}</style>
      <div style={{ width: '360px', padding: '48px' }}>
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <div style={{ fontSize: '24px', fontWeight: 300, letterSpacing: '6px', textTransform: 'uppercase', marginBottom: '8px' }}>Nite Salon</div>
          <div className="mono" style={{ fontSize: '10px', letterSpacing: '3px', color: '#c9a96e' }}>OWNER DASHBOARD</div>
        </div>
        <form onSubmit={login} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <input required type="email" placeholder="Email" value={loginForm.email} onChange={e => setLoginForm({ ...loginForm, email: e.target.value })} />
          <input required type="password" placeholder="Password" value={loginForm.password} onChange={e => setLoginForm({ ...loginForm, password: e.target.value })} />
          {loginError && <div className="mono" style={{ fontSize: '11px', color: '#e07070' }}>{loginError}</div>}
          <button type="submit" style={{ background: '#c9a96e', color: '#0a0a08', border: 'none', padding: '14px', fontFamily: 'Montserrat', fontSize: '11px', fontWeight: 500, letterSpacing: '3px', textTransform: 'uppercase', cursor: 'pointer' }}>Sign In</button>
        </form>
      </div>
    </div>
  );

  const tabs = ['appointments', 'clients', 'staff', 'revenue'];

  return (
    <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", background: '#0a0a08', minHeight: '100vh', color: '#e8e0d4' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400&family=Montserrat:wght@300;400;500&display=swap');
        * { box-sizing: border-box; }
        .mono { font-family: 'Montserrat', sans-serif; }
        table { width: 100%; border-collapse: collapse; }
        th { font-family: 'Montserrat'; font-size: 9px; letter-spacing: 3px; text-transform: uppercase; color: #555; text-align: left; padding: 12px 16px; border-bottom: 1px solid #1a1a14; }
        td { padding: 14px 16px; border-bottom: 1px solid #12120e; font-size: 15px; }
        tr:hover td { background: #0d0d0a; }
        .tab-btn { background: transparent; border: none; font-family: 'Montserrat'; font-size: 10px; letter-spacing: 3px; text-transform: uppercase; color: #555; cursor: pointer; padding: 8px 0; transition: color 0.2s; border-bottom: 1px solid transparent; }
        .tab-btn.active { color: #c9a96e; border-bottom-color: #c9a96e; }
        .tab-btn:hover { color: #e8e0d4; }
        input, select { background: #12120e; border: 1px solid #1e1e18; color: #e8e0d4; padding: 8px 12px; font-family: 'Montserrat'; font-size: 12px; outline: none; }
        input:focus, select:focus { border-color: #c9a96e; }
        select option { background: #12120e; }
        .status-btn { border: none; font-family: 'Montserrat'; font-size: 9px; letter-spacing: 1px; padding: 4px 10px; cursor: pointer; background: transparent; transition: all 0.2s; }
      `}</style>

      {/* HEADER */}
      <div style={{ padding: '20px 40px', borderBottom: '1px solid #1a1a14', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: '18px', fontWeight: 300, letterSpacing: '4px', textTransform: 'uppercase' }}>Nite Salon</div>
          <div className="mono" style={{ fontSize: '9px', letterSpacing: '3px', color: '#c9a96e' }}>OPERATIONS DASHBOARD</div>
        </div>
        <button onClick={logout} style={{ background: 'transparent', border: '1px solid #2a2a22', color: '#666', fontFamily: 'Montserrat', fontSize: '10px', letterSpacing: '2px', padding: '8px 20px', cursor: 'pointer' }}>Sign Out</button>
      </div>

      {/* TABS */}
      <div style={{ padding: '0 40px', borderBottom: '1px solid #1a1a14', display: 'flex', gap: '32px' }}>
        {tabs.map(t => (
          <button key={t} className={`tab-btn ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div style={{ padding: '32px 40px' }}>

        {/* APPOINTMENTS */}
        {tab === 'appointments' && (
          <div>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', alignItems: 'center' }}>
              <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} />
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="">All statuses</option>
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <button onClick={() => fetchTab('appointments')} style={{ background: '#c9a96e', color: '#0a0a08', border: 'none', padding: '8px 20px', fontFamily: 'Montserrat', fontSize: '10px', letterSpacing: '2px', cursor: 'pointer' }}>Filter</button>
            </div>
            {loading ? <div className="mono" style={{ fontSize: '12px', color: '#555' }}>Loading...</div> : (
              <table>
                <thead><tr><th>Client</th><th>Service</th><th>Stylist</th><th>Date</th><th>Time</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {appointments.length === 0 && <tr><td colSpan={7} style={{ color: '#444', fontStyle: 'italic' }}>No appointments found</td></tr>}
                  {appointments.map(a => (
                    <tr key={a.id}>
                      <td>
                        <div>{a.client_name}</div>
                        <div className="mono" style={{ fontSize: '11px', color: '#555' }}>{a.client_email}</div>
                      </td>
                      <td>
                        <div>{a.services?.name}</div>
                        <div className="mono" style={{ fontSize: '11px', color: '#c9a96e' }}>${a.services?.price}</div>
                      </td>
                      <td className="mono" style={{ fontSize: '12px', color: '#888' }}>{a.staff?.name || '—'}</td>
                      <td className="mono" style={{ fontSize: '12px' }}>{a.appointment_date}</td>
                      <td className="mono" style={{ fontSize: '12px' }}>{a.appointment_time}</td>
                      <td><span className="mono" style={{ fontSize: '10px', letterSpacing: '1px', color: statusColor(a.status) }}>{a.status?.toUpperCase()}</span></td>
                      <td>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {['confirmed', 'completed', 'cancelled'].filter(s => s !== a.status).map(s => (
                            <button key={s} className="status-btn" onClick={() => updateStatus(a.id, s)} style={{ color: statusColor(s), border: `1px solid ${statusColor(s)}44` }}>
                              {s}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* CLIENTS */}
        {tab === 'clients' && (
          <div>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
              <input placeholder="Search clients..." value={clientSearch} onChange={e => setClientSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchTab('clients')} style={{ width: '280px' }} />
              <button onClick={() => fetchTab('clients')} style={{ background: '#c9a96e', color: '#0a0a08', border: 'none', padding: '8px 20px', fontFamily: 'Montserrat', fontSize: '10px', letterSpacing: '2px', cursor: 'pointer' }}>Search</button>
            </div>
            {loading ? <div className="mono" style={{ fontSize: '12px', color: '#555' }}>Loading...</div> : (
              <table>
                <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Since</th></tr></thead>
                <tbody>
                  {clients.length === 0 && <tr><td colSpan={4} style={{ color: '#444', fontStyle: 'italic' }}>No clients found</td></tr>}
                  {clients.map(c => (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      <td className="mono" style={{ fontSize: '12px', color: '#888' }}>{c.email || '—'}</td>
                      <td className="mono" style={{ fontSize: '12px', color: '#888' }}>{c.phone || '—'}</td>
                      <td className="mono" style={{ fontSize: '11px', color: '#555' }}>{c.created_at?.split('T')[0]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* STAFF */}
        {tab === 'staff' && (
          <div>
            {loading ? <div className="mono" style={{ fontSize: '12px', color: '#555' }}>Loading...</div> : (
              <table>
                <thead><tr><th>Name</th><th>Role</th><th>Email</th><th>Phone</th><th>Status</th></tr></thead>
                <tbody>
                  {staff.length === 0 && <tr><td colSpan={5} style={{ color: '#444', fontStyle: 'italic' }}>No staff found</td></tr>}
                  {staff.map(s => (
                    <tr key={s.id}>
                      <td>{s.name}</td>
                      <td className="mono" style={{ fontSize: '12px', color: '#c9a96e' }}>{s.role}</td>
                      <td className="mono" style={{ fontSize: '12px', color: '#888' }}>{s.email || '—'}</td>
                      <td className="mono" style={{ fontSize: '12px', color: '#888' }}>{s.phone || '—'}</td>
                      <td><span className="mono" style={{ fontSize: '10px', color: s.is_active ? '#6ec9a9' : '#e07070' }}>{s.is_active ? 'ACTIVE' : 'INACTIVE'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* REVENUE */}
        {tab === 'revenue' && (
          <div>
            {loading ? <div className="mono" style={{ fontSize: '12px', color: '#555' }}>Loading...</div> : revenue && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1px', background: '#1a1a14', marginBottom: '40px' }}>
                  {[
                    { label: 'Total Revenue', value: `$${revenue.total?.toLocaleString() || 0}`, accent: true },
                    { label: 'Completed Appts', value: revenue.count || 0 },
                    { label: 'Avg per Service', value: revenue.count ? `$${(revenue.total / revenue.count).toFixed(0)}` : '—' },
                  ].map((stat, i) => (
                    <div key={i} style={{ background: '#0a0a08', padding: '32px' }}>
                      <div className="mono" style={{ fontSize: '9px', letterSpacing: '3px', color: '#555', marginBottom: '12px' }}>{stat.label.toUpperCase()}</div>
                      <div style={{ fontSize: '40px', fontWeight: 300, color: stat.accent ? '#c9a96e' : '#e8e0d4' }}>{stat.value}</div>
                    </div>
                  ))}
                </div>
                <table>
                  <thead><tr><th>Date</th><th>Service</th><th>Stylist</th><th>Amount</th></tr></thead>
                  <tbody>
                    {revenue.appointments?.length === 0 && <tr><td colSpan={4} style={{ color: '#444', fontStyle: 'italic' }}>No completed appointments</td></tr>}
                    {revenue.appointments?.map((a, i) => (
                      <tr key={i}>
                        <td className="mono" style={{ fontSize: '12px' }}>{a.appointment_date}</td>
                        <td>{a.services?.name}</td>
                        <td className="mono" style={{ fontSize: '12px', color: '#888' }}>{a.staff?.name || '—'}</td>
                        <td style={{ color: '#c9a96e' }}>${a.services?.price}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
