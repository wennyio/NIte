import { useState, useEffect, useRef } from 'react';
import axios from 'axios';

const QUESTIONS = [
  { key: 'business_name', question: "What's your business name?", placeholder: "e.g. Luxe Studio, Bark & Bath, FitZone..." },
  { key: 'business_type', question: "What kind of business is it?", placeholder: "e.g. salon, dog groomer, gym, barbershop..." },
  { key: 'owner_name', question: "What's your name?", placeholder: "Your first name" },
  { key: 'services_raw', question: "What services do you offer? List them with prices if you know them.", placeholder: "e.g. Haircut $45, Color $120, Blowout $35" },
  { key: 'staff_raw', question: "How many staff do you have, and what are their roles?", placeholder: "e.g. Just me, or: 1 owner + 2 stylists" },
  { key: 'needs_raw', question: "What do you need to run your business? What's painful right now?", placeholder: "e.g. booking appointments, tracking clients, seeing revenue..." },
];

function parseServices(raw) {
  return raw.split(',').map(s => {
    const match = s.match(/([^$\d]+)\$?(\d+)?/);
    const name = match?.[1]?.trim() || s.trim();
    const price = match?.[2] ? parseInt(match[2]) : null;
    return price ? { name, price, duration: '30 min' } : { name, duration: '30 min' };
  }).filter(s => s.name);
}

function parseStaff(raw) {
  const lower = raw.toLowerCase();
  if (lower.includes('just me') || lower.includes('only me') || lower.includes('solo')) return ['owner'];
  const nums = raw.match(/\d+/g);
  const staff = ['owner'];
  if (nums) {
    for (let i = 1; i < Math.min(parseInt(nums[0]) + 1, 6); i++) staff.push('staff');
  }
  return staff;
}

export default function Intake() {
  const [messages, setMessages] = useState([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState({});
  const [input, setInput] = useState('');
  const [phase, setPhase] = useState('chat'); // chat | confirming | generating | done | error
  const [buildStatus, setBuildStatus] = useState('');
  const [pollInterval, setPollInterval] = useState(null);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    // Opening message
    setTimeout(() => {
      addMessage('nite', "Hey! I'm Nite. I'll build you a complete web app for your business in about 2 minutes. Just answer a few quick questions.");
      setTimeout(() => {
        addMessage('nite', QUESTIONS[0].question);
      }, 800);
    }, 400);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (phase === 'chat') inputRef.current?.focus();
  }, [phase, currentQ]);

  const addMessage = (from, text) => {
    setMessages(prev => [...prev, { from, text, id: Date.now() + Math.random() }]);
  };

  const handleSend = () => {
    const val = input.trim();
    if (!val || phase !== 'chat') return;
    setInput('');

    addMessage('user', val);
    const key = QUESTIONS[currentQ].key;
    const newAnswers = { ...answers, [key]: val };
    setAnswers(newAnswers);

    const next = currentQ + 1;
    if (next < QUESTIONS.length) {
      setTimeout(() => {
        addMessage('nite', QUESTIONS[next].question);
        setCurrentQ(next);
      }, 500);
    } else {
      // All questions answered — show summary
      setTimeout(() => showSummary(newAnswers), 600);
    }
  };

  const showSummary = (ans) => {
    setPhase('confirming');
    const services = parseServices(ans.services_raw);
    const summary = `Got it! Here's what I'll build for **${ans.business_name}**:\n\n• Public booking page with ${services.length} service${services.length !== 1 ? 's' : ''}\n• Client management\n• Staff dashboard\n• Revenue tracking\n\nReady to generate your app?`;
    addMessage('nite', summary);
  };

  const handleGenerate = async () => {
    setPhase('generating');
    addMessage('nite', "Building your app now... This takes about 60-90 seconds. Hang tight! 🔨");

    const services = parseServices(answers.services_raw);
    const staff = parseStaff(answers.staff_raw);

    const businessContext = {
      business_name: answers.business_name,
      business_type: answers.business_type.toLowerCase(),
      owner_name: answers.owner_name,
      services,
      staff,
      needs: answers.needs_raw.split(',').map(s => s.trim()),
      public_features: ['booking page', 'service menu', 'contact info'],
      dashboard_features: ['appointment management', 'client profiles', 'revenue dashboard', 'staff management'],
    };

    try {
      await axios.post('/admin/generate', { businessContext });
      startPolling();
    } catch (err) {
      setPhase('error');
      addMessage('nite', "Something went wrong starting the build. Please try again.");
    }
  };

  const startPolling = () => {
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const r = await axios.get('/admin/build-status');
        const status = r.data.status;
        setBuildStatus(status);

        if (status === 'rebuilding') {
          addMessage('nite', "✓ Code generated. Building frontend...");
        } else if (status === 'restarting') {
          addMessage('nite', "✓ Frontend built. Launching your app...");
          clearInterval(interval);
          setTimeout(() => {
            setPhase('done');
            addMessage('nite', `🎉 Your app is ready! Go to the home page to see your new ${answers.business_name} site.`);
          }, 3000);
        } else if (status === 'error') {
          clearInterval(interval);
          setPhase('error');
          addMessage('nite', "Build failed. Our team has been notified. Please try again.");
        }

        if (attempts > 60) {
          clearInterval(interval);
          setPhase('error');
          addMessage('nite', "This is taking longer than expected. Please refresh and try again.");
        }
      } catch { }
    }, 3000);
    setPollInterval(interval);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const progress = Math.round((currentQ / QUESTIONS.length) * 100);

  return (
    <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", background: '#0a0a08', minHeight: '100vh', display: 'flex', flexDirection: 'column', color: '#e8e0d4' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300&family=Montserrat:wght@300;400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .mono { font-family: 'Montserrat', sans-serif; }
        .msg-nite { background: #12120e; border: 1px solid #1e1e18; padding: 16px 20px; border-radius: 2px 16px 16px 16px; max-width: 480px; font-size: 17px; line-height: 1.6; }
        .msg-user { background: #1a1a0e; border: 1px solid #2a2a18; padding: 16px 20px; border-radius: 16px 2px 16px 16px; max-width: 480px; font-size: 17px; line-height: 1.6; margin-left: auto; color: #c9a96e; }
        .msg-wrap { display: flex; flex-direction: column; gap: 4px; animation: fadeUp 0.4s ease forwards; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        textarea { background: transparent; border: none; outline: none; color: #e8e0d4; font-family: 'Cormorant Garamond', Georgia, serif; font-size: 18px; resize: none; width: 100%; line-height: 1.5; }
        textarea::placeholder { color: #444; }
        .send-btn { background: #c9a96e; border: none; color: #0a0a08; width: 44px; height: 44px; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: background 0.2s; font-size: 18px; }
        .send-btn:hover { background: #e8c98a; }
        .send-btn:disabled { background: #2a2a22; cursor: default; }
        .confirm-btn { background: #c9a96e; color: #0a0a08; border: none; padding: 14px 40px; font-family: 'Montserrat', sans-serif; font-size: 11px; font-weight: 500; letter-spacing: 3px; text-transform: uppercase; cursor: pointer; transition: background 0.2s; }
        .confirm-btn:hover { background: #e8c98a; }
        .progress-bar { height: 2px; background: #1a1a14; transition: width 0.5s ease; }
        .progress-fill { height: 100%; background: #c9a96e; transition: width 0.5s ease; }
        .pulse { animation: pulse 1.5s infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>

      {/* HEADER */}
      <div style={{ padding: '20px 32px', borderBottom: '1px solid #1a1a14', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: '20px', fontWeight: 300, letterSpacing: '5px', textTransform: 'uppercase' }}>Nite</div>
          <div className="mono" style={{ fontSize: '9px', letterSpacing: '3px', color: '#c9a96e' }}>APP BUILDER</div>
        </div>
        {phase === 'chat' && currentQ > 0 && (
          <div style={{ textAlign: 'right' }}>
            <div className="mono" style={{ fontSize: '9px', letterSpacing: '2px', color: '#555', marginBottom: '6px' }}>{currentQ} OF {QUESTIONS.length}</div>
            <div style={{ width: '120px' }} className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }}></div>
            </div>
          </div>
        )}
      </div>

      {/* MESSAGES */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '32px', display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '720px', width: '100%', margin: '0 auto' }}>
        {messages.map(msg => (
          <div key={msg.id} className="msg-wrap">
            {msg.from === 'nite' && (
              <div className="mono" style={{ fontSize: '9px', letterSpacing: '2px', color: '#c9a96e', marginBottom: '4px' }}>NITE</div>
            )}
            <div className={msg.from === 'nite' ? 'msg-nite' : 'msg-user'}>
              {msg.text.split('\n').map((line, i) => (
                <div key={i} style={{ marginBottom: line === '' ? '8px' : '0' }}>
                  {line.startsWith('•') ? (
                    <div className="mono" style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>{line}</div>
                  ) : line.includes('**') ? (
                    <span dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.*?)\*\*/g, '<strong style="color:#c9a96e">$1</strong>') }} />
                  ) : line}
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* CONFIRM BUTTON */}
        {phase === 'confirming' && (
          <div style={{ animation: 'fadeUp 0.4s ease forwards', marginTop: '8px' }}>
            <button className="confirm-btn" onClick={handleGenerate}>Build My App →</button>
          </div>
        )}

        {/* GENERATING STATUS */}
        {phase === 'generating' && (
          <div className="mono pulse" style={{ fontSize: '11px', letterSpacing: '2px', color: '#c9a96e' }}>
            {buildStatus === 'rebuilding' ? '▸ BUILDING FRONTEND...' :
             buildStatus === 'restarting' ? '▸ LAUNCHING...' :
             '▸ GENERATING CODE...'}
          </div>
        )}

        {/* DONE */}
        {phase === 'done' && (
          <div style={{ animation: 'fadeUp 0.4s ease forwards' }}>
            <a href="/" style={{ display: 'inline-block', background: '#c9a96e', color: '#0a0a08', padding: '14px 40px', fontFamily: 'Montserrat', fontSize: '11px', fontWeight: 500, letterSpacing: '3px', textTransform: 'uppercase', textDecoration: 'none' }}>
              View Your App →
            </a>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* INPUT */}
      {phase === 'chat' && (
        <div style={{ borderTop: '1px solid #1a1a14', padding: '20px 32px', maxWidth: '720px', width: '100%', margin: '0 auto' }}>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', borderBottom: '1px solid #2a2a22', paddingBottom: '16px' }}>
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={QUESTIONS[Math.min(currentQ, QUESTIONS.length - 1)]?.placeholder}
              style={{ minHeight: '28px', maxHeight: '120px' }}
            />
            <button className="send-btn" onClick={handleSend} disabled={!input.trim()}>→</button>
          </div>
          <div className="mono" style={{ fontSize: '9px', letterSpacing: '2px', color: '#333', marginTop: '10px' }}>PRESS ENTER TO SEND</div>
        </div>
      )}
    </div>
  );
}
