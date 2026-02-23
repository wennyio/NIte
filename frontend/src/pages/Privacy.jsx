import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

const DEFAULT_PRIVACY_PAGE = {
  title: 'Privacy Policy',
  content: [
    'This page describes what customer information is collected and how it is used.',
    'Replace this placeholder with your own data handling and retention policy.',
    'Need help? Ask the site assistant to rewrite this page to match your business.'
  ].join('\n\n')
};

export default function Privacy() {
  const [page, setPage] = useState(DEFAULT_PRIVACY_PAGE);

  useEffect(() => {
    axios.get('/api/legal/privacy')
      .then((r) => {
        if (r?.data?.title && r?.data?.content) setPage(r.data);
      })
      .catch(() => {});
  }, []);

  return (
    <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", background: '#f6f2ec', minHeight: '100vh', color: '#2d2520' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;600&family=Montserrat:wght@300;400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .mono { font-family: 'Montserrat', sans-serif; }
        a { text-decoration: none; color: #b79367; }
      `}</style>
      <div style={{ maxWidth: '860px', margin: '0 auto', padding: '48px 28px 80px' }}>
        <div style={{ marginBottom: '24px' }}>
          <Link to="/" className="mono" style={{ fontSize: '11px', letterSpacing: '2px' }}>← BACK TO SITE</Link>
        </div>
        <div className="mono" style={{ fontSize: '10px', letterSpacing: '4px', color: '#b79367', marginBottom: '12px' }}>LEGAL</div>
        <h1 style={{ fontSize: '56px', fontWeight: 300, marginBottom: '24px' }}>{page.title}</h1>
        <div className="mono" style={{ fontSize: '10px', letterSpacing: '1px', color: '#9b8a78', marginBottom: '14px' }}>
          Owner tip: edit this page from Dashboard → Legal.
        </div>
        <div style={{ background: '#fff', border: '1px solid #e6ddd2', padding: '20px 22px' }}>
          {String(page.content || '').split('\n').map((line, idx) => (
            <p key={idx} className="mono" style={{ color: '#6d6258', lineHeight: 1.8, marginBottom: line.trim() ? '10px' : '18px' }}>
              {line || '\u00A0'}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
