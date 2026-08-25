import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './app/hooks/useAuth';
import { AuthContext } from './app/contexts/AuthContext';
import { ProjectProvider } from './app/contexts/ProjectContext';
import { AppStatusProvider } from './app/contexts/AppStatusContext';
import { ModelStatusProvider } from './app/contexts/ModelStatusContext';
import AppLayout from './app/layouts/AppLayout';
import Home from './app/pages/Home';
import Settings from './app/pages/Settings';

function App() {
  const [user, setUser, _authReady] = useAuth();

  return (
    <AuthContext.Provider value={{ user, setUser }}>
      <ProjectProvider>
        <AppStatusProvider>
          <ModelStatusProvider>
            <Routes>
              <Route path="/" element={<AppLayout><Home /></AppLayout>} />
              <Route path="/settings" element={<AppLayout><Settings /></AppLayout>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </ModelStatusProvider>
        </AppStatusProvider>
      </ProjectProvider>
    </AuthContext.Provider>
  );
}

export default App;
