import './index.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('App error:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          fontFamily: 'Montserrat, sans-serif',
          background: '#0a0a08',
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#e8e0d4',
          flexDirection: 'column',
          gap: '24px',
          padding: '40px'
        }}>
          <div style={{ fontSize: '11px', letterSpacing: '4px', color: '#c9a96e' }}>NITE</div>
          <div style={{ fontSize: '28px', fontFamily: 'Cormorant Garamond, serif', fontWeight: 300 }}>
            Something went wrong
          </div>
          <div style={{ fontSize: '13px', color: '#555', maxWidth: '400px', textAlign: 'center', lineHeight: 1.6 }}>
            We hit an unexpected error. Try refreshing the page — if it keeps happening, your site is still live and your data is safe.
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: '#c9a96e',
              color: '#0a0a08',
              border: 'none',
              padding: '12px 32px',
              fontFamily: 'Montserrat, sans-serif',
              fontSize: '11px',
              letterSpacing: '3px',
              textTransform: 'uppercase',
              cursor: 'pointer'
            }}
          >
            Refresh Page
          </button>
          <div style={{ fontSize: '11px', color: '#333', fontFamily: 'monospace' }}>
            {this.state.error?.message}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
