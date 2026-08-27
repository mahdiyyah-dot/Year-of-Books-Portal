import React, { useState } from 'react';
import { loginWithUsername } from '../supabaseClient';

function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Please fill in all credentials.');
      return;
    }

    try {
      setLoading(true);
      setError('');
      await loginWithUsername(username, password);
    } catch (err) {
      setError(err.message || 'Incorrect username or password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-root animate-fade">
      <div className="login-card animate-slide">
        {/* Brand Logo Header */}
        <div className="login-logo-section">
          <svg className="login-logo-svg" viewBox="0 0 100 100" width="100" height="100">
            {/* Logo shapes: book spines */}
            <path d="M22,75 L22,30 Q22,24 34,24 L34,75 Z" fill="#29A2E1" />
            <path d="M39,75 L39,46 Q39,40 51,40 L51,75 Z" fill="#713F98" />
            <path d="M56,75 L56,18 Q56,12 68,12 L68,75 Z" fill="#D01F82" />
            {/* Star above middle book */}
            <polygon points="45,15 48,22 56,23 50,28 51,35 45,31 39,35 40,28 34,23 42,22" fill="#FCB913" />
          </svg>
          <h1 className="login-brand-name">MAHDIYYAH</h1>
          <h2 className="login-brand-title">YEAR OF BOOKS</h2>
          <p className="login-brand-tagline">“She reads, She leads”</p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="login-form">
          <h3 className="login-form-title">Portal Login</h3>
          
          {error && (
            <div className="alert alert-warning">
              <span className="alert-icon">⚠️</span>
              <div>{error}</div>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. centre_calicut"
              disabled={loading}
              autoComplete="username"
              required
            />
          </div>

          <div className="form-group" style={{ marginTop: '16px' }}>
            <label htmlFor="password">Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={loading}
                autoComplete="current-password"
                required
                style={{ paddingRight: '45px' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '16px',
                  padding: '4px',
                  color: 'var(--text-muted)'
                }}
                title={showPassword ? 'Hide Password' : 'Show Password'}
              >
                {showPassword ? '👁️' : '🔒'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '24px', height: '48px' }}
            disabled={loading}
          >
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>
      </div>

      {/* Footer Branding */}
      <div className="login-footer">
        © 2026 Mahdiyyah Office. All rights reserved.
      </div>

      {/* Quick custom styles for the login viewport (placed here for isolation) */}
      <style>{`
        .login-root {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          background-color: var(--bg-main);
          padding: 20px;
        }

        .login-card {
          background-color: var(--bg-card);
          border-radius: var(--radius-lg);
          padding: 36px 28px;
          width: 100%;
          max-width: 400px;
          border: 1px solid var(--border);
          box-shadow: var(--shadow-lg);
        }

        .login-logo-section {
          text-align: center;
          margin-bottom: 28px;
        }

        .login-logo-svg {
          filter: drop-shadow(0 6px 12px rgba(113, 63, 152, 0.1));
          margin-bottom: 12px;
        }

        .login-brand-name {
          font-size: 20px;
          font-weight: 800;
          color: var(--text-main);
          letter-spacing: 2px;
          margin-bottom: 2px;
        }

        .login-brand-title {
          font-size: 15px;
          font-weight: 700;
          color: var(--primary);
          letter-spacing: 1px;
          margin-bottom: 6px;
        }

        .login-brand-tagline {
          font-size: 13px;
          font-style: italic;
          color: var(--text-muted);
        }

        .login-form-title {
          font-size: 16px;
          font-weight: 700;
          color: var(--dark-text);
          margin-bottom: 20px;
          border-bottom: 1px solid var(--border);
          padding-bottom: 8px;
          text-align: center;
        }

        .login-footer {
          margin-top: 24px;
          font-size: 11px;
          color: var(--text-muted);
          text-align: center;
        }
      `}</style>
    </div>
  );
}

export default Login;
