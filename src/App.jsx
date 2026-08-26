import React, { useState, useEffect } from 'react';
import { supabase, getUserRole, logout } from './supabaseClient';
import Login from './pages/Login';
import CoordinatorDashboard from './pages/CoordinatorDashboard';
import AdminDashboard from './pages/AdminDashboard';
import './App.css';

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState(null);
  const [profileData, setProfileData] = useState(null);

  // Monitor Supabase Auth changes
  useEffect(() => {
    // Check active session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        fetchRole(session.user);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        setSession(newSession);
        if (newSession) {
          fetchRole(newSession.user);
        } else {
          setRole(null);
          setProfileData(null);
          setLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // Fetch the role details (Admin vs Coordinator)
  const fetchRole = async (user) => {
    try {
      setLoading(true);
      const roleResult = await getUserRole(user);
      if (roleResult) {
        setRole(roleResult.role);
        setProfileData(roleResult.data);
      }
    } catch (err) {
      console.error('Error determining session access role:', err);
    } finally {
      setLoading(false);
    }
  };

  // Perform logout
  const handleLogout = async () => {
    try {
      setLoading(true);
      await logout();
    } catch (err) {
      alert('Error signing out: ' + err.message);
      setLoading(false);
    }
  };

  // Update profile data in local state (useful for coordinator profile edits)
  const updateLocalProfile = (newData) => {
    setProfileData(prev => ({ ...prev, ...newData }));
  };

  // Loader Visual
  if (loading) {
    return (
      <div className="brand-loader-container">
        <div className="brand-loader-spin">
          <svg className="yob-svg-loader" viewBox="0 0 100 100" width="80" height="80">
            {/* Book Spines Drawing mimicking Logo */}
            <path d="M25,75 L25,30 Q25,25 35,25 L35,75 Z" fill="#29A2E1" />
            <path d="M40,75 L40,45 Q40,40 50,40 L50,75 Z" fill="#713F98" />
            <path d="M55,75 L55,20 Q55,15 65,15 L65,75 Z" fill="#D01F82" />
            <polygon points="45,15 48,22 55,23 50,28 51,35 45,31 39,35 40,28 35,23 42,22" fill="#FCB913" />
          </svg>
        </div>
        <div className="brand-loader-text">Mahdiyyah Year of Books</div>
        <div className="brand-loader-sub">Loading portal...</div>
      </div>
    );
  }

  // Routing Tree
  if (!session) {
    return <Login />;
  }

  if (role === 'admin') {
    return (
      <AdminDashboard 
        user={session.user} 
        onLogout={handleLogout} 
      />
    );
  }

  if (role === 'coordinator') {
    return (
      <CoordinatorDashboard 
        user={session.user} 
        profile={profileData} 
        onProfileUpdate={updateLocalProfile}
        onLogout={handleLogout} 
      />
    );
  }

  // Fallback if authenticated but role data load failed
  return (
    <div className="error-fallback-container">
      <div className="card text-center" style={{ maxWidth: '400px', margin: '40px auto' }}>
        <h2 style={{ color: 'var(--error)', marginBottom: '12px' }}>Access Blocked</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '20px' }}>
          Your account is logged in, but we couldn't match it to a valid study centre profile. Please check with your administrator.
        </p>
        <button className="btn btn-primary" onClick={handleLogout}>Back to Login</button>
      </div>
    </div>
  );
}

export default App;
