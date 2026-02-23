import { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

export default function Contact() {
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setSending(true);
    setStatus('');
    try {
      await axios.post('/api/contact', form);
      setStatus('Message sent. We will get back to you soon.');
      setForm({ name: '', email: '', subject: '', message: '' });
    } catch {
      setStatus('Unable to send message right now. Please try again.');
    }
    setSending(false);
  };

  return (
    <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", background: '#f6f2ec', minHeight: '100vh', color: '#2d2520' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;600&family=Montserrat:wght@300;400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .mono { font-family: 'Montserrat', sans-serif; }
        input, textarea {
          width: 100%;
          border: 1px solid #dbcdbf;
          background: #fff;
          padding: 12px 14px;
          font-family: 'Montserrat', sans-serif;
          font-size: 13px;
          color: #2d2520;
          outline: none;
        }
        textarea { min-height: 140px; resize: vertical; }
        input:focus, textarea:focus { border-color: #b79367; }
        a { text-decoration: none; color: #b79367; }
      `}</style>
      <div style={{ maxWidth: '860px', margin: '0 auto', padding: '48px 28px 80px' }}>
        <div style={{ marginBottom: '24px' }}>
          <Link to="/" className="mono" style={{ fontSize: '11px', letterSpacing: '2px' }}>← BACK TO SITE</Link>
        </div>
        <div className="mono" style={{ fontSize: '10px', letterSpacing: '4px', color: '#b79367', marginBottom: '12px' }}>CONNECT</div>
        <h1 style={{ fontSize: '56px', fontWeight: 300, marginBottom: '14px' }}>Contact Us</h1>
        <p className="mono" style={{ color: '#6d6258', lineHeight: 1.8, marginBottom: '28px' }}>
          Ask questions, request details, or send a message to the team. You can customize this page content anytime.
        </p>
        <form onSubmit={submit} style={{ display: 'grid', gap: '12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <input required placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input required type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <input placeholder="Subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          <textarea required placeholder="Message" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
          {status && <div className="mono" style={{ fontSize: '12px', color: '#b79367', letterSpacing: '1px' }}>{status}</div>}
          <button
            type="submit"
            disabled={sending}
            style={{
              background: '#b79367',
              color: '#fff',
              border: 'none',
              fontFamily: 'Montserrat',
              fontSize: '11px',
              letterSpacing: '2px',
              padding: '13px 16px',
              textTransform: 'uppercase',
              cursor: 'pointer',
              opacity: sending ? 0.6 : 1
            }}
          >
            {sending ? 'Sending...' : 'Send Message'}
          </button>
        </form>
      </div>
    </div>
  );
}
