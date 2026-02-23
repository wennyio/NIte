import { useState, useEffect } from 'react';
import axios from 'axios';

const ADMIN_TOKEN_KEY = 'nite_admin_token';

export default function CommandCenter() {
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [adminToken, setAdminToken] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [customers, setCustomers] = useState([]);
  const [builds, setBuilds] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [events, setEvents] = useState([]);
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(false);
  const [settingLiveId, setSettingLiveId] = useState('');
  const [routingDrafts, setRoutingDrafts] = useState({});
  const [routingBusyId, setRoutingBusyId] = useState('');
  const [routingMessage, setRoutingMessage] = useState('');

  const authHeaders = (tokenValue = adminToken) => (
    tokenValue ? { Authorization: `Bearer ${tokenValue}` } : {}
  );

  const clearSession = () => {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    setAuthed(false);
    setAdminToken('');
  };

  const handleUnauthorized = () => {
    clearSession();
    setError('Session expired. Please sign in again.');
  };

  const fetchData = async (tokenOverride = adminToken) => {
    if (!tokenOverride) return;
    setLoading(true);
    setRoutingMessage('');
    try {
      const headers = authHeaders(tokenOverride);
      const [custRes, buildRes, analyticsRes, eventsRes] = await Promise.all([
        axios.get('/admin/customers', { headers }),
        axios.get('/admin/build-status'),
        axios.get('/admin/analytics', { headers }),
        axios.get('/admin/events?limit=80', { headers })
      ]);
      const list = Array.isArray(custRes.data) ? custRes.data : [];
      setCustomers(list);
      const drafts = {};
      list.forEach((c) => {
        drafts[c.id] = c.container_url || '';
      });
      setRoutingDrafts(drafts);
      setBuilds(buildRes.data || null);
      setAnalytics(analyticsRes.data || null);
      setEvents(Array.isArray(eventsRes.data) ? eventsRes.data : []);
    } catch (err) {
      if (err?.response?.status === 401 || err?.response?.status === 403) {
        handleUnauthorized();
      } else {
        console.error(err);
        setError(err?.response?.data?.error || 'Failed to load Command Center data.');
      }
    }
    setLoading(false);
  };

  const login = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await axios.post('/admin/auth/login', { password });
      const token = String(res?.data?.token || '').trim();
      if (!token) throw new Error('No admin token returned');
      sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
      setAdminToken(token);
      setAuthed(true);
      setPassword('');
      await fetchData(token);
    } catch (err) {
      const msg = err?.response?.data?.error || 'Wrong password';
      setError(msg);
    }
  };

  const logout = () => {
    clearSession();
    setError('');
  };

  useEffect(() => {
    let active = true;
    const restoreSession = async () => {
      const saved = String(sessionStorage.getItem(ADMIN_TOKEN_KEY) || '').trim();
      if (!saved) {
        if (active) setCheckingAuth(false);
        return;
      }
      try {
        await axios.get('/admin/auth/me', { headers: authHeaders(saved) });
        if (!active) return;
        setAdminToken(saved);
        setAuthed(true);
      } catch {
        sessionStorage.removeItem(ADMIN_TOKEN_KEY);
      } finally {
        if (active) setCheckingAuth(false);
      }
    };
    restoreSession();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!authed || !adminToken) return;
    fetchData(adminToken);
  }, [authed, adminToken]);

  const setLiveCustomer = async (customerId) => {
    if (!customerId || !adminToken) return;
    setSettingLiveId(customerId);
    try {
      await axios.post('/admin/set-live', { customerId }, { headers: authHeaders() });
      await fetchData();
    } catch (err) {
      if (err?.response?.status === 401 || err?.response?.status === 403) {
        handleUnauthorized();
      } else {
        console.error(err);
        setRoutingMessage(err?.response?.data?.error || 'Failed to set live app.');
      }
    }
    setSettingLiveId('');
  };

  const saveRouting = async (customerId) => {
    if (!customerId || !adminToken) return;
    setRoutingBusyId(customerId);
    setRoutingMessage('');
    try {
      await axios.patch(
        `/admin/customers/${customerId}/routing`,
        { container_url: (routingDrafts[customerId] || '').trim() },
        { headers: authHeaders() }
      );
      setRoutingMessage('Routing updated.');
      await fetchData();
    } catch (err) {
      if (err?.response?.status === 401 || err?.response?.status === 403) {
        handleUnauthorized();
      } else {
        const msg = err?.response?.data?.error || 'Failed to update routing.';
        setRoutingMessage(msg);
      }
    }
    setRoutingBusyId('');
  };

  const tierColor = (tier) => ({
    starter: '#6b7280',
    growth: '#c9a96e',
    pro: '#6ec9a9'
  })[tier] || '#6b7280';

  const statusColor = (status) => ({
    active: '#6ec9a9',
    inactive: '#e07070',
    trial: '#c9a96e'
  })[status] || '#6b7280';

  const appStatusColor = (status) => ({
    live: '#6ec9a9',
    generating: '#c9a96e',
    queued: '#7b93ff',
    error: '#e07070',
    pending: '#6b7280'
  })[status] || '#6b7280';

  const totalCustomers = analytics?.totals?.totalCustomers ?? customers.length;
  const activeCustomers = analytics?.totals?.activeCustomers ?? customers.filter((c) => c.status === 'active').length;
  const liveApps = analytics?.totals?.liveApps ?? customers.filter((c) => c.app_status === 'live').length;
  const generatedCustomers = analytics?.totals?.generatedCustomers ?? 0;
  const generationCoveragePct = analytics?.totals?.generationCoveragePct ?? 0;
  const createdLast24h = analytics?.totals?.createdLast24h ?? 0;
  const createdLast7d = analytics?.totals?.createdLast7d ?? 0;
  const queueDepth = analytics?.buildState?.queueDepth ?? 0;
  const mrr = customers.reduce((sum, c) => {
    const prices = { starter: 99, growth: 199, pro: 349 };
    return c.status === 'active' ? sum + (prices[c.tier] || 0) : sum;
  }, 0);

  if (checkingAuth) {
    return (
      <div style={{ fontFamily: "'Montserrat', sans-serif", background: '#0a0a08', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>
        Checking admin session...
      </div>
    );
  }

  if (!authed) return (
    <div style={{ fontFamily: "'Montserrat', sans-serif", background: '#0a0a08', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e8e0d4' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400&family=Montserrat:wght@300;400;500;600&display=swap'); * { box-sizing: border-box; } input { background: #12120e; border: 1px solid #2a2a22; color: #e8e0d4; padding: 12px 16px; font-family: 'Montserrat'; font-size: 13px; width: 100%; outline: none; } input:focus { border-color: #c9a96e; }`}</style>
      <div style={{ width: '360px', padding: '48px', border: '1px solid #1a1a14' }}>
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{ fontFamily: 'Cormorant Garamond', fontSize: '28px', fontWeight: 300, letterSpacing: '8px', textTransform: 'uppercase' }}>NITE</div>
          <div style={{ fontSize: '10px', letterSpacing: '4px', color: '#c9a96e', marginTop: '6px' }}>COMMAND CENTER</div>
        </div>
        <form onSubmit={login} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <input type="password" placeholder="Admin password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <div style={{ fontSize: '11px', color: '#e07070' }}>{error}</div>}
          <button type="submit" style={{ background: '#c9a96e', color: '#0a0a08', border: 'none', padding: '14px', fontFamily: 'Montserrat', fontSize: '11px', fontWeight: 600, letterSpacing: '3px', textTransform: 'uppercase', cursor: 'pointer' }}>Enter</button>
        </form>
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily: "'Montserrat', sans-serif", background: '#0a0a08', minHeight: '100vh', color: '#e8e0d4' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400&family=Montserrat:wght@300;400;500;600&display=swap');
        * { box-sizing: border-box; }
        table { width: 100%; border-collapse: collapse; }
        th { font-size: 9px; letter-spacing: 3px; text-transform: uppercase; color: #555; text-align: left; padding: 12px 16px; border-bottom: 1px solid #1a1a14; }
        td { padding: 14px 16px; border-bottom: 1px solid #0d0d0a; font-size: 13px; vertical-align: top; }
        tr:hover td { background: #0d0d0a; }
        .tab { background: transparent; border: none; font-size: 10px; letter-spacing: 3px; text-transform: uppercase; color: #555; cursor: pointer; padding: 8px 0; border-bottom: 1px solid transparent; transition: all 0.2s; }
        .tab.active { color: #c9a96e; border-bottom-color: #c9a96e; }
        .tab:hover { color: #e8e0d4; }
        .stat-card { background: #0d0d0a; border: 1px solid #1a1a14; padding: 24px; }
        .badge { font-size: 9px; letter-spacing: 1px; text-transform: uppercase; padding: 3px 8px; border-radius: 2px; }
      `}</style>

      <div style={{ padding: '20px 40px', borderBottom: '1px solid #1a1a14', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontFamily: 'Cormorant Garamond', fontSize: '22px', fontWeight: 300, letterSpacing: '6px', textTransform: 'uppercase' }}>NITE</div>
          <div style={{ fontSize: '9px', letterSpacing: '4px', color: '#c9a96e' }}>COMMAND CENTER</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <div style={{ fontSize: '11px', color: '#555' }}>
            Build: <span style={{ color: builds?.status === 'complete' ? '#6ec9a9' : builds?.status === 'generating' ? '#c9a96e' : builds?.status === 'queued' ? '#7b93ff' : builds?.status === 'error' ? '#e07070' : '#555' }}>
              {builds?.status?.toUpperCase() || 'IDLE'}
            </span>
          </div>
          <div style={{ fontSize: '11px', color: '#555' }}>
            Coverage: <span style={{ color: '#c9a96e' }}>{generationCoveragePct}%</span>
          </div>
          <button onClick={() => fetchData()} style={{ background: 'transparent', border: '1px solid #2a2a22', color: '#888', fontFamily: 'Montserrat', fontSize: '10px', letterSpacing: '2px', padding: '6px 16px', cursor: 'pointer' }}>Refresh</button>
          <button onClick={logout} style={{ background: 'transparent', border: '1px solid #2a2a22', color: '#666', fontFamily: 'Montserrat', fontSize: '10px', letterSpacing: '2px', padding: '6px 16px', cursor: 'pointer' }}>Sign Out</button>
        </div>
      </div>

      <div style={{ padding: '0 40px', borderBottom: '1px solid #1a1a14', display: 'flex', gap: '32px' }}>
        {['overview', 'customers', 'ops', 'revenue'].map((t) => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div style={{ padding: '32px 40px' }}>
        {error && <div style={{ marginBottom: '16px', color: '#e07070', fontSize: '11px', letterSpacing: '1px' }}>{error}</div>}

        {tab === 'overview' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1px', background: '#1a1a14', marginBottom: '40px' }}>
              {[
                { label: 'Total Customers', value: totalCustomers, accent: false },
                { label: 'Active Customers', value: activeCustomers, accent: false },
                { label: 'Monthly Revenue', value: `$${mrr.toLocaleString()}`, accent: true },
                { label: 'Live Apps', value: liveApps, accent: false },
              ].map((stat, i) => (
                <div key={i} className="stat-card">
                  <div style={{ fontSize: '9px', letterSpacing: '3px', color: '#555', marginBottom: '12px' }}>{stat.label.toUpperCase()}</div>
                  <div style={{ fontSize: '36px', fontWeight: 300, fontFamily: 'Cormorant Garamond', color: stat.accent ? '#c9a96e' : '#e8e0d4' }}>{stat.value}</div>
                </div>
              ))}
            </div>

            <div style={{ marginBottom: '8px', fontSize: '10px', letterSpacing: '3px', color: '#555' }}>RECENT CUSTOMERS</div>
            {loading ? <div style={{ fontSize: '12px', color: '#555' }}>Loading...</div> : (
              <table>
                <thead><tr><th>Business</th><th>Type</th><th>Owner</th><th>Tier</th><th>Status</th><th>App</th><th>Since</th><th>Actions</th></tr></thead>
                <tbody>
                  {customers.length === 0 && (
                    <tr><td colSpan={8} style={{ color: '#333', fontStyle: 'italic', textAlign: 'center', padding: '40px' }}>No customers yet — share your intake link to get started</td></tr>
                  )}
                  {customers.map((c) => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 500 }}>{c.business_name}</td>
                      <td style={{ color: '#888', fontSize: '12px' }}>{c.business_type || '—'}</td>
                      <td>
                        <div style={{ fontSize: '12px' }}>{c.owner_name || '—'}</div>
                        <div style={{ fontSize: '11px', color: '#555' }}>{c.owner_email || '—'}</div>
                      </td>
                      <td><span className="badge" style={{ color: tierColor(c.tier), border: `1px solid ${tierColor(c.tier)}44` }}>{c.tier?.toUpperCase() || 'STARTER'}</span></td>
                      <td><span className="badge" style={{ color: statusColor(c.status), border: `1px solid ${statusColor(c.status)}44` }}>{c.status?.toUpperCase() || 'ACTIVE'}</span></td>
                      <td><span className="badge" style={{ color: appStatusColor(c.app_status), border: `1px solid ${appStatusColor(c.app_status)}44` }}>{c.app_status?.toUpperCase() || 'LIVE'}</span></td>
                      <td style={{ fontSize: '11px', color: '#555' }}>{c.created_at?.split('T')[0] || '—'}</td>
                      <td>
                        <button
                          onClick={() => setLiveCustomer(c.id)}
                          disabled={settingLiveId === c.id || c.app_status === 'live'}
                          style={{
                            background: c.app_status === 'live' ? '#6ec9a922' : 'transparent',
                            border: `1px solid ${c.app_status === 'live' ? '#6ec9a9' : '#2a2a22'}`,
                            color: c.app_status === 'live' ? '#6ec9a9' : '#888',
                            fontFamily: 'Montserrat',
                            fontSize: '9px',
                            letterSpacing: '1px',
                            padding: '5px 8px',
                            cursor: c.app_status === 'live' ? 'default' : 'pointer',
                            marginRight: c.container_url ? '8px' : '0'
                          }}
                        >
                          {settingLiveId === c.id ? 'SETTING...' : c.app_status === 'live' ? 'LIVE' : 'SET LIVE'}
                        </button>
                        {c.container_url && (
                          <a href={c.container_url} target="_blank" rel="noreferrer" style={{ fontSize: '10px', color: '#c9a96e', letterSpacing: '1px', textDecoration: 'none' }}>VIEW APP →</a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === 'customers' && (
          <div>
            <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '10px', letterSpacing: '3px', color: '#555' }}>ALL CUSTOMERS — {customers.length} TOTAL</div>
            </div>
            {routingMessage && (
              <div style={{ marginBottom: '14px', fontSize: '11px', color: '#c9a96e', letterSpacing: '1px' }}>{routingMessage}</div>
            )}
            <table>
              <thead><tr><th>Business</th><th>Type</th><th>Owner</th><th>Email</th><th>Tier</th><th>Status</th><th>Subdomain</th><th>Routing</th><th>Created</th></tr></thead>
              <tbody>
                {customers.length === 0 && (
                  <tr><td colSpan={9} style={{ color: '#333', fontStyle: 'italic', textAlign: 'center', padding: '40px' }}>No customers yet</td></tr>
                )}
                {customers.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 500 }}>{c.business_name}</td>
                    <td style={{ color: '#888', fontSize: '12px' }}>{c.business_type || '—'}</td>
                    <td style={{ fontSize: '12px' }}>{c.owner_name || '—'}</td>
                    <td style={{ fontSize: '12px', color: '#888' }}>{c.owner_email || '—'}</td>
                    <td><span className="badge" style={{ color: tierColor(c.tier), border: `1px solid ${tierColor(c.tier)}44` }}>{c.tier?.toUpperCase() || 'STARTER'}</span></td>
                    <td><span className="badge" style={{ color: statusColor(c.status), border: `1px solid ${statusColor(c.status)}44` }}>{c.status?.toUpperCase() || 'ACTIVE'}</span></td>
                    <td style={{ fontSize: '12px', color: '#c9a96e' }}>{c.subdomain || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input
                          value={routingDrafts[c.id] || ''}
                          onChange={(e) => setRoutingDrafts((prev) => ({ ...prev, [c.id]: e.target.value }))}
                          placeholder="https://customer-app.example.com"
                          style={{ background: '#12120e', border: '1px solid #2a2a22', color: '#e8e0d4', padding: '6px 8px', fontSize: '11px', width: '240px', fontFamily: 'Montserrat' }}
                        />
                        <button
                          onClick={() => saveRouting(c.id)}
                          disabled={routingBusyId === c.id}
                          style={{ background: 'transparent', border: '1px solid #2a2a22', color: '#c9a96e', fontSize: '9px', letterSpacing: '1px', padding: '5px 8px', cursor: 'pointer', opacity: routingBusyId === c.id ? 0.6 : 1 }}
                        >
                          {routingBusyId === c.id ? 'SAVING...' : 'SAVE'}
                        </button>
                      </div>
                    </td>
                    <td style={{ fontSize: '11px', color: '#555' }}>{c.created_at?.split('T')[0] || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'ops' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1px', background: '#1a1a14', marginBottom: '32px' }}>
              {[
                { label: 'Queue Depth', value: queueDepth, accent: true },
                { label: 'Generated Customers', value: generatedCustomers, accent: false },
                { label: 'New (24h)', value: createdLast24h, accent: false },
                { label: 'New (7d)', value: createdLast7d, accent: false }
              ].map((stat, i) => (
                <div key={i} className="stat-card">
                  <div style={{ fontSize: '9px', letterSpacing: '3px', color: '#555', marginBottom: '12px' }}>{stat.label.toUpperCase()}</div>
                  <div style={{ fontSize: '34px', fontWeight: 300, fontFamily: 'Cormorant Garamond', color: stat.accent ? '#c9a96e' : '#e8e0d4' }}>{stat.value}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '32px' }}>
              <div>
                <div style={{ marginBottom: '8px', fontSize: '10px', letterSpacing: '3px', color: '#555' }}>TOP BUSINESS TYPES</div>
                <table>
                  <thead><tr><th>Type</th><th>Count</th></tr></thead>
                  <tbody>
                    {(analytics?.breakdowns?.topBusinessTypes || []).length === 0 && (
                      <tr><td colSpan={2} style={{ color: '#333', fontStyle: 'italic', textAlign: 'center', padding: '30px' }}>No data yet</td></tr>
                    )}
                    {(analytics?.breakdowns?.topBusinessTypes || []).map((row) => (
                      <tr key={row.name}>
                        <td>{row.name}</td>
                        <td style={{ color: '#c9a96e' }}>{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <div style={{ marginBottom: '8px', fontSize: '10px', letterSpacing: '3px', color: '#555' }}>APP STATUS BREAKDOWN</div>
                <table>
                  <thead><tr><th>Status</th><th>Count</th></tr></thead>
                  <tbody>
                    {Object.keys(analytics?.breakdowns?.byAppStatus || {}).length === 0 && (
                      <tr><td colSpan={2} style={{ color: '#333', fontStyle: 'italic', textAlign: 'center', padding: '30px' }}>No data yet</td></tr>
                    )}
                    {Object.entries(analytics?.breakdowns?.byAppStatus || {}).map(([status, count]) => (
                      <tr key={status}>
                        <td><span className="badge" style={{ color: appStatusColor(status), border: `1px solid ${appStatusColor(status)}44` }}>{status}</span></td>
                        <td style={{ color: '#c9a96e' }}>{count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ marginBottom: '8px', fontSize: '10px', letterSpacing: '3px', color: '#555' }}>EVENT STREAM</div>
            <table>
              <thead><tr><th>Time</th><th>Event</th><th>Actor</th><th>Customer</th><th>Message</th></tr></thead>
              <tbody>
                {events.length === 0 && (
                  <tr><td colSpan={5} style={{ color: '#333', fontStyle: 'italic', textAlign: 'center', padding: '40px' }}>No events yet</td></tr>
                )}
                {events.map((evt) => (
                  <tr key={evt.id}>
                    <td style={{ fontSize: '11px', color: '#777' }}>{evt.created_at ? new Date(evt.created_at).toLocaleString() : '—'}</td>
                    <td><span className="badge" style={{ color: '#7b93ff', border: '1px solid #7b93ff44' }}>{evt.event_type || 'event'}</span></td>
                    <td style={{ color: '#888', fontSize: '12px' }}>{evt.actor || 'system'}</td>
                    <td style={{ color: '#888', fontSize: '11px' }}>{evt.customer_id ? String(evt.customer_id).slice(0, 8) : '—'}</td>
                    <td style={{ maxWidth: '420px', color: '#c9a96e', fontSize: '12px' }}>{evt.message || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'revenue' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1px', background: '#1a1a14', marginBottom: '40px' }}>
              {[
                { label: 'MRR', value: `$${mrr.toLocaleString()}` },
                { label: 'ARR (projected)', value: `$${(mrr * 12).toLocaleString()}` },
                { label: 'Avg Revenue / Customer', value: activeCustomers ? `$${Math.round(mrr / activeCustomers)}` : '$0' },
              ].map((stat, i) => (
                <div key={i} className="stat-card">
                  <div style={{ fontSize: '9px', letterSpacing: '3px', color: '#555', marginBottom: '12px' }}>{stat.label.toUpperCase()}</div>
                  <div style={{ fontSize: '36px', fontWeight: 300, fontFamily: 'Cormorant Garamond', color: '#c9a96e' }}>{stat.value}</div>
                </div>
              ))}
            </div>

            <div style={{ marginBottom: '8px', fontSize: '10px', letterSpacing: '3px', color: '#555' }}>REVENUE BY TIER</div>
            <table>
              <thead><tr><th>Tier</th><th>Customers</th><th>Price/mo</th><th>MRR</th></tr></thead>
              <tbody>
                {[
                  { tier: 'starter', price: 99 },
                  { tier: 'growth', price: 199 },
                  { tier: 'pro', price: 349 },
                ].map(({ tier, price }) => {
                  const count = customers.filter((c) => c.tier === tier && c.status === 'active').length;
                  return (
                    <tr key={tier}>
                      <td><span className="badge" style={{ color: tierColor(tier), border: `1px solid ${tierColor(tier)}44` }}>{tier.toUpperCase()}</span></td>
                      <td>{count}</td>
                      <td style={{ color: '#888' }}>${price}/mo</td>
                      <td style={{ color: '#c9a96e', fontFamily: 'Cormorant Garamond', fontSize: '18px' }}>${(count * price).toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
