import { useState, useEffect, useRef } from 'react';
import axios from 'axios';

const PROMPT_EXAMPLE = `Build a premium website and dashboard for my business.
Business: Toy4Fun
Type: Kids toy ecommerce brand
Need: beautiful public storefront, product highlights, newsletter capture, owner dashboard insights.
Style: modern, playful, premium.`;

function statusText(status) {
  if (status === 'queued') return 'WAITING IN BUILD QUEUE...';
  if (status === 'idle') return 'PREPARING BUILD...';
  if (status === 'generating') return 'GENERATING CUSTOM CODE...';
  if (status === 'rebuilding') return 'BUILDING FRONTEND...';
  if (status === 'restarting') return 'LAUNCHING...';
  if (status === 'complete' || status === 'live') return 'DONE';
  if (status === 'error') return 'BUILD FAILED';
  return 'GENERATING...';
}

export default function Intake() {
  const [phase, setPhase] = useState('draft'); // draft | analyzing | confirming | generating | done | error
  const [prompt, setPrompt] = useState('');
  const [preview, setPreview] = useState(null);
  const [buildStatus, setBuildStatus] = useState('');
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState('');
  const [pollInterval, setPollInterval] = useState(null);
  const [currentCustomerId, setCurrentCustomerId] = useState('');
  const [businessName, setBusinessName] = useState('');
  const bottomRef = useRef(null);
  const lastStatusRef = useRef('');

  useEffect(() => {
    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [pollInterval]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs, phase]);

  const addLog = (text) => {
    setLogs((prev) => [...prev, { id: `${Date.now()}-${Math.random()}`, text }]);
  };

  const analyzePrompt = async () => {
    const val = String(prompt || '').trim();
    if (val.length < 20) {
      setError('Please add more detail so I can build the right app.');
      return;
    }
    setError('');
    setPhase('analyzing');
    setPreview(null);
    setLogs([]);
    lastStatusRef.current = '';
    try {
      const r = await axios.post('/admin/intake-parse', { prompt: val });
      const context = r?.data?.businessContext;
      if (!context?.business_name || !context?.business_type) {
        throw new Error('Failed to parse business context');
      }
      setPreview(context);
      setBusinessName(context.business_name);
      setPhase('confirming');
    } catch (err) {
      setPhase('draft');
      setError(err?.response?.data?.error || 'Could not process your prompt. Please try again.');
    }
  };

  const startPolling = (customerId, parsedBusinessName) => {
    let attempts = 0;
    let pollFailures = 0;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const r = await axios.get('/admin/build-status', {
          params: customerId ? { customerId } : {}
        });
        pollFailures = 0;
        const status = r?.data?.status;
        setBuildStatus(status);

        if (status && status !== lastStatusRef.current) {
          if (status === 'queued') addLog('You are in queue. Your build starts automatically.');
          if (status === 'idle') addLog('Build request received. Preparing generation job...');
          if (status === 'generating') addLog('Build started. Generating your custom app...');
          if (status === 'rebuilding') addLog('Code generated. Building frontend assets...');
          if (status === 'restarting') addLog('Frontend built. Launching your live app...');
          if (status === 'complete' || status === 'live') addLog('Build complete. Your app is now live.');
          lastStatusRef.current = status;
        }

        if (status === 'complete' || status === 'live') {
          clearInterval(interval);
          setPhase('done');
          return;
        }
        if (status === 'error') {
          clearInterval(interval);
          setPhase('error');
          setError('Build failed. Please retry with a clearer prompt.');
          return;
        }

        if (attempts > 200) {
          try {
            await axios.post('/admin/set-live', { customerId });
            clearInterval(interval);
            setBuildStatus('complete');
            addLog('Recovered build state and promoted your app to live.');
            setPhase('done');
            return;
          } catch { }
          clearInterval(interval);
          setPhase('error');
          setError('Your app is taking a bit longer than expected. Visit the home page in a few minutes to see it live.');
          return;
        }
      } catch {
        pollFailures++;
        if (pollFailures === 5) addLog('Still checking your build status... network seems slow, retrying.');
      }
    }, 3000);
    setPollInterval(interval);
    setBusinessName(parsedBusinessName || businessName);
  };

  const buildFromPrompt = async () => {
    if (!preview) return;
    setError('');
    setPhase('generating');
    setLogs([]);
    lastStatusRef.current = '';
    addLog(`Creating owner profile for ${preview.business_name}...`);

    try {
      const customerRes = await axios.post('/admin/customers', {
        business_name: preview.business_name,
        business_type: preview.business_type,
        owner_name: preview.owner_name,
        owner_email: preview.owner_email
      });
      const customerId = customerRes?.data?.id;
      if (!customerId) throw new Error('Customer creation failed');
      setCurrentCustomerId(customerId);
      addLog('Customer profile created. Queuing generation...');

      await axios.post('/admin/generate', {
        businessContext: preview,
        customerId
      });
      addLog('Build queued. Tracking progress now...');
      startPolling(customerId, preview.business_name);
    } catch (err) {
      setPhase('error');
      setError(err?.response?.data?.error || 'Something went wrong starting your build.');
    }
  };

  return (
    <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", background: '#0a0a08', minHeight: '100vh', color: '#e8e0d4' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300&family=Montserrat:wght@300;400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .mono { font-family: 'Montserrat', sans-serif; }
        textarea, input {
          width: 100%;
          background: #12120e;
          border: 1px solid #1e1e18;
          color: #e8e0d4;
          padding: 14px 16px;
          font-family: 'Montserrat', sans-serif;
          font-size: 13px;
          outline: none;
        }
        textarea:focus, input:focus { border-color: #c9a96e; }
        .btn {
          background: #c9a96e;
          color: #0a0a08;
          border: none;
          padding: 14px 24px;
          font-family: 'Montserrat', sans-serif;
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 3px;
          text-transform: uppercase;
          cursor: pointer;
        }
        .btn:disabled { opacity: 0.5; cursor: default; }
        .btn-ghost {
          background: transparent;
          color: #c9a96e;
          border: 1px solid #c9a96e55;
          padding: 12px 18px;
          font-family: 'Montserrat', sans-serif;
          font-size: 10px;
          letter-spacing: 2px;
          text-transform: uppercase;
          cursor: pointer;
        }
      `}</style>

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '28px 24px 64px' }}>
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '20px', fontWeight: 300, letterSpacing: '5px', textTransform: 'uppercase' }}>Nite</div>
          <div className="mono" style={{ fontSize: '9px', letterSpacing: '3px', color: '#c9a96e' }}>APP BUILDER</div>
        </div>

        {(phase === 'draft' || phase === 'analyzing' || phase === 'confirming' || phase === 'error') && (
          <div style={{ border: '1px solid #1a1a14', padding: '18px' }}>
            <div className="mono" style={{ fontSize: '10px', letterSpacing: '3px', color: '#c9a96e', marginBottom: '10px' }}>
              DESCRIBE WHAT YOU WANT
            </div>
            <h1 style={{ fontSize: '38px', fontWeight: 300, marginBottom: '12px' }}>
              Prompt-first onboarding
            </h1>
            <p className="mono" style={{ fontSize: '12px', color: '#777', lineHeight: 1.7, marginBottom: '14px' }}>
              Tell Nite what business you run, the vibe you want, and what your app should do.
              No rigid questionnaire. Just describe it naturally.
            </p>
            <textarea
              rows={8}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={PROMPT_EXAMPLE}
              disabled={phase === 'analyzing'}
            />
            {error && <div className="mono" style={{ fontSize: '12px', color: '#e07070', marginTop: '10px' }}>{error}</div>}
            <div style={{ marginTop: '14px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button className="btn" onClick={analyzePrompt} disabled={phase === 'analyzing'}>
                {phase === 'analyzing' ? 'Analyzing...' : 'Review Prompt →'}
              </button>
              {phase === 'confirming' && (
                <>
                  <button className="btn" onClick={buildFromPrompt}>Build My App →</button>
                  <button className="btn-ghost" onClick={() => setPhase('draft')}>Edit Prompt</button>
                </>
              )}
            </div>
          </div>
        )}

        {phase === 'confirming' && preview && (
          <div style={{ marginTop: '16px', border: '1px solid #1a1a14', padding: '18px' }}>
            <div className="mono" style={{ fontSize: '10px', letterSpacing: '3px', color: '#c9a96e', marginBottom: '8px' }}>BUILD PREVIEW</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px', marginBottom: '14px' }}>
              <div style={{ border: '1px solid #1a1a14', padding: '10px' }}>
                <div className="mono" style={{ fontSize: '9px', color: '#777', letterSpacing: '2px' }}>BUSINESS</div>
                <div>{preview.business_name}</div>
              </div>
              <div style={{ border: '1px solid #1a1a14', padding: '10px' }}>
                <div className="mono" style={{ fontSize: '9px', color: '#777', letterSpacing: '2px' }}>TYPE</div>
                <div>{preview.business_type}</div>
              </div>
              <div style={{ border: '1px solid #1a1a14', padding: '10px' }}>
                <div className="mono" style={{ fontSize: '9px', color: '#777', letterSpacing: '2px' }}>OWNER EMAIL</div>
                <div>{preview.owner_email}</div>
              </div>
            </div>
            <div className="mono" style={{ fontSize: '10px', color: '#c9a96e', marginBottom: '8px', letterSpacing: '2px' }}>
              OFFERINGS ({Array.isArray(preview.services) ? preview.services.length : 0})
            </div>
            <div style={{ display: 'grid', gap: '8px' }}>
              {(Array.isArray(preview.services) ? preview.services : []).slice(0, 8).map((s, idx) => (
                <div key={idx} style={{ border: '1px solid #1a1a14', padding: '10px', display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                  <span>{s.name}</span>
                  <span className="mono" style={{ color: '#c9a96e' }}>
                    {Number.isFinite(Number(s.price)) ? `$${Number(s.price)}` : (s.duration || 'Included')}
                  </span>
                </div>
              ))}
              {(Array.isArray(preview.services) ? preview.services : []).length === 0 && (
                <div className="mono" style={{ fontSize: '12px', color: '#777' }}>No explicit services found; app will be generated from your prompt context.</div>
              )}
            </div>
          </div>
        )}

        {phase === 'generating' && (
          <div style={{ marginTop: '16px', border: '1px solid #1a1a14', padding: '18px' }}>
            <div className="mono" style={{ fontSize: '10px', letterSpacing: '3px', color: '#c9a96e', marginBottom: '10px' }}>
              GENERATING {businessName ? `· ${businessName.toUpperCase()}` : ''}
            </div>
            <div className="mono" style={{ fontSize: '12px', color: '#e8e0d4', marginBottom: '12px' }}>
              ▸ {statusText(buildStatus)}
            </div>
            <div style={{ display: 'grid', gap: '8px' }}>
              {logs.map((item) => (
                <div key={item.id} className="mono" style={{ fontSize: '12px', color: '#888', border: '1px solid #1a1a14', padding: '8px 10px' }}>
                  {item.text}
                </div>
              ))}
              {logs.length === 0 && (
                <div className="mono" style={{ fontSize: '12px', color: '#777' }}>Preparing build...</div>
              )}
            </div>
            <div ref={bottomRef} />
          </div>
        )}

        {phase === 'done' && (
          <div style={{ marginTop: '16px', border: '1px solid #1a1a14', padding: '20px' }}>
            <div style={{ fontSize: '34px', fontWeight: 300, marginBottom: '10px' }}>Your app is live</div>
            <p className="mono" style={{ fontSize: '12px', color: '#888', lineHeight: 1.8, marginBottom: '14px' }}>
              Built for {businessName || 'your business'}. Open your site, then use the dashboard Site Assistant to iterate in plain language.
            </p>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <a className="btn" href="/" style={{ textDecoration: 'none', display: 'inline-block' }}>View Site</a>
              <a className="btn-ghost" href="/dashboard" style={{ textDecoration: 'none', display: 'inline-block' }}>Open Dashboard</a>
              {currentCustomerId && (
                <span className="mono" style={{ fontSize: '10px', color: '#666', alignSelf: 'center' }}>
                  Customer ID: {currentCustomerId}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
