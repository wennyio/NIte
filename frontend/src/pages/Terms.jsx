import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

export default function Terms() {
  const [page, setPage] = useState({
    title: 'Terms of Service',
    content: 'Loading terms...'
  });

  useEffect(() => {
    axios.get('/api/legal/terms')
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
