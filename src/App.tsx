import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './app/hooks/useAuth';
import { AuthContext } from './app/contexts/AuthContext';
import AppLayout from './app/layouts/AppLayout';
import Home from './app/pages/Home';
import Login from './app/pages/Login';
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
import Welcome from './app/pages/Welcome';

const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron;

function App() {
  const [user, setUser, _authReady] = useAuth();

  return (
    <AuthContext.Provider value={{ user, setUser }}>
      <Routes>
        {/* Pages without sidebar */}
        <Route path="/welcome" element={<Welcome />} />
        <Route path="/login" element={<Login />} />
        <Route path="/forgot" element={<Forgot />} />
        <Route path="/reset" element={<Reset />} />
        <Route path="/verify" element={<Verify />} />
        <Route path="/resend" element={<Resend />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/oauth-callback" element={<OAuthCallback />} />

        {/* Pages with sidebar */}
        <Route path="/" element={<AppLayout><Home /></AppLayout>} />
        <Route path="/invite" element={<AppLayout><Invite /></AppLayout>} />
        <Route path="/projects" element={<AppLayout><Projects /></AppLayout>} />
        <Route path="/project/:slug" element={<AppLayout><Project /></AppLayout>} />
        <Route path="/documents" element={<AppLayout><Documents /></AppLayout>} />
        <Route path="/profile" element={<AppLayout><Profile /></AppLayout>} />
        <Route path="/settings" element={<AppLayout><Settings /></AppLayout>} />
        <Route path="/developer" element={isElectron ? <Navigate to="/" replace /> : <AppLayout><Developer /></AppLayout>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthContext.Provider>
  );
}

export default App;
