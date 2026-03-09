import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './app/hooks/useAuth';
import { AuthContext } from './app/contexts/AuthContext';
import AppLayout from './app/layouts/AppLayout';
import Home from './app/pages/Home';
import Projects from './app/pages/Projects';
import Settings from './app/pages/Settings';

function App() {
  const [user, setUser, _authReady] = useAuth();

  return (
    <AuthContext.Provider value={{ user, setUser }}>
      <Routes>
        <Route path="/" element={<AppLayout><Home /></AppLayout>} />
        <Route path="/projects" element={<AppLayout><Projects /></AppLayout>} />
        <Route path="/settings" element={<AppLayout><Settings /></AppLayout>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthContext.Provider>
  );
}

export default App;
