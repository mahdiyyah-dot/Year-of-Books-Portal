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
    // Check active session on initial mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        fetchRole(session.user, true);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        if (event === 'SIGNED_OUT' || !newSession) {
          setSession(null);
          setRole(null);
          setProfileData(null);
          setLoading(false);
          return;
        }

        setSession(newSession);

        // If user session already has role established, do not reload or show loading screen on background token refresh
        setRole(currentRole => {
          if (!currentRole) {
            fetchRole(newSession.user, false);
          }
          return currentRole;
        });
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // Fetch the role details (Admin vs Coordinator)
  const fetchRole = async (user, showLoader = false) => {
    try {
      if (showLoader) setLoading(true);
      const roleResult = await getUserRole(user);
      if (roleResult) {
        setRole(roleResult.role);
        setProfileData(roleResult.data);
      }
    } catch (err) {
      console.error('Error determining session access role:', err);
    } finally {
      if (showLoader) setLoading(false);
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
          <img 
            src="/logo.jpg" 
            alt="Mahdiyyah Year of Books" 
            style={{ width: '80px', height: 'auto', borderRadius: '12px', boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }} 
          />
        </div>
        <div className="brand-loader-text">MY PULSE TRACKER</div>
        <div className="brand-loader-sub">Mahdiyyah Year of Books</div>
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
