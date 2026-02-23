import { Link } from 'react-router-dom';

export default function Privacy() {
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
        <h1 style={{ fontSize: '56px', fontWeight: 300, marginBottom: '24px' }}>Privacy Policy</h1>
        <p className="mono" style={{ color: '#6d6258', lineHeight: 1.8, marginBottom: '28px' }}>
          This page explains what customer data is collected and how it is used. Replace this placeholder with
          your legal language or ask the site assistant to customize it.
        </p>
        <div style={{ display: 'grid', gap: '18px' }}>
          {[
            ['What We Collect', 'Name, contact details, booking details, and communication preferences.'],
            ['How We Use Data', 'To confirm appointments, provide service updates, and improve customer experience.'],
            ['Data Sharing', 'State whether data is shared with payment processors, scheduling tools, or analytics providers.'],
            ['Security', 'Describe safeguards used to protect customer information.'],
            ['Your Rights', 'Explain how users can request updates or deletion of their personal data.']
          ].map(([title, copy]) => (
            <section key={title} style={{ background: '#fff', border: '1px solid #e6ddd2', padding: '20px 22px' }}>
              <h2 style={{ fontSize: '28px', fontWeight: 400, marginBottom: '8px' }}>{title}</h2>
              <p className="mono" style={{ color: '#6d6258', lineHeight: 1.8 }}>{copy}</p>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
