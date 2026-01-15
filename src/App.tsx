import { useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Box } from '@mui/material';
import Sidebar from './app/components/sidebar';
import MobileNav from './app/components/mobile-nav';
import { useAuth } from './app/hooks/useAuth';
import { AuthContext } from './app/contexts/AuthContext';
import Home from './app/pages/Home';
import Login from './app/pages/Login';
import Signup from './app/pages/Signup';
import Forgot from './app/pages/Forgot';
import Reset from './app/pages/Reset';
import Verify from './app/pages/Verify';
import Resend from './app/pages/Resend';
import Invite from './app/pages/Invite';
import Projects from './app/pages/Projects';
import Project from './app/pages/Project';
import Documents from './app/pages/Documents';
import Profile from './app/pages/Profile';
import Settings from './app/pages/Settings';
import Terms from './app/pages/Terms';
import Developer from './app/pages/Developer';
import OAuthCallback from './app/pages/OAuthCallback';

const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron;

// Routes that should not show the sidebar
const authRoutes = ['/login', '/signup', '/forgot', '/reset', '/verify', '/resend', '/oauth-callback', '/terms'];

function App() {
  const location = useLocation();
  const [user, setUser] = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const showSidebar = !authRoutes.includes(location.pathname);

  return (
    <AuthContext.Provider value={{ user, setUser }}>
    <div className="wrapper">
      {showSidebar && user && (
        <>
          {/* Persistent Sidebar across all app routes */}
          <Sidebar
            user={user}
            mobileOpen={mobileMenuOpen}
            onMobileClose={() => setMobileMenuOpen(false)}
          />
        </>
      )}

      <Box sx={{ marginLeft: { xs: 0, md: showSidebar && user ? '280px' : 0 } }}>
        {showSidebar && user && (
          /* Mobile Nav */
          <Box sx={{ display: { xs: 'block', md: 'none' } }}>
            <MobileNav onMenuClick={() => setMobileMenuOpen(true)} />
          </Box>
        )}

        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={isElectron ? <Navigate to="/login" replace /> : <Signup />} />
          <Route path="/forgot" element={<Forgot />} />
          <Route path="/reset" element={<Reset />} />
          <Route path="/verify" element={<Verify />} />
          <Route path="/resend" element={<Resend />} />
          <Route path="/invite" element={<Invite />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/project/:slug" element={<Project />} />
          <Route path="/documents" element={<Documents />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/developer" element={isElectron ? <Navigate to="/" replace /> : <Developer />} />
          <Route path="/oauth-callback" element={<OAuthCallback />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Box>
    </div>
    </AuthContext.Provider>
  );
}

export default App;

