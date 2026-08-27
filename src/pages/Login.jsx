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
          <img 
            src="/logo.jpg" 
            alt="Mahdiyyah Year of Books - My Pulse Tracker" 
            className="login-brand-img"
          />
          <div className="login-tracker-badge">MY PULSE TRACKER</div>
          <p className="login-brand-tagline">Reading program under Mahdiyyah Year of Books</p>
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
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          margin-bottom: 24px;
        }

        .login-brand-img {
          width: 140px;
          max-width: 100%;
          height: auto;
          border-radius: 12px;
          margin: 0 auto 12px auto;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
          object-fit: contain;
          display: block;
        }

        .login-tracker-badge {
          display: inline-block;
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 1.5px;
          color: var(--primary);
          background: rgba(113, 63, 152, 0.08);
          padding: 5px 16px;
          border-radius: 20px;
          margin: 0 auto 6px auto;
          text-align: center;
        }

        .login-brand-tagline {
          font-size: 12px;
          color: var(--text-muted);
          margin-top: 2px;
          text-align: center;
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
