import { Link } from 'react-router-dom';

export default function Terms() {
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
        <h1 style={{ fontSize: '56px', fontWeight: 300, marginBottom: '24px' }}>Terms of Service</h1>
        <p className="mono" style={{ color: '#6d6258', lineHeight: 1.8, marginBottom: '28px' }}>
          These terms describe how customers use this website, book services, and interact with the business.
          Replace this placeholder with your own business terms or ask the site assistant to rewrite this page.
        </p>
        <div style={{ display: 'grid', gap: '18px' }}>
          {[
            ['Bookings & Cancellations', 'Define your cancellation policy, deposit expectations, and no-show handling.'],
            ['Service Availability', 'Clarify that appointment requests are subject to confirmation by your team.'],
            ['Payments', 'List accepted payment methods and when charges are collected.'],
            ['Liability', 'Describe any limitations of liability and health/safety disclosures.'],
            ['Contact', 'Provide official support channels for legal or booking concerns.']
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
