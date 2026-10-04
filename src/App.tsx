import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './app/hooks/useAuth';
import { AuthContext } from './app/contexts/AuthContext';
import { ProjectProvider } from './app/contexts/ProjectContext';
import { AppStatusProvider } from './app/contexts/AppStatusContext';
import { ModelStatusProvider } from './app/contexts/ModelStatusContext';
import { ChatSessionsProvider } from './app/contexts/ChatSessionsContext';
import AppLayout from './app/layouts/AppLayout';
import Home from './app/pages/Home';
import Settings from './app/pages/Settings';
import Login from './app/pages/Login';

function App() {
  const [user, setUser, _authReady] = useAuth();

  return (
    <AuthContext.Provider value={{ user, setUser }}>
      <ProjectProvider>
        <AppStatusProvider>
          <ModelStatusProvider>
            {/* Above <Routes> on purpose: chat streams live in the main process
                and this is their only subscriber, so it has to outlive the route
                swap that unmounts Home when you open Settings. */}
            <ChatSessionsProvider>
              <Routes>
                <Route path="/" element={<AppLayout><Home /></AppLayout>} />
                <Route path="/settings" element={<AppLayout><Settings /></AppLayout>} />
                {/* Sign-in is a page of the app, not a trip to the browser — see
                    Login.tsx. Deliberately OUTSIDE AppLayout: it owns the whole
                    window. The sidebar would otherwise sit beside a sign-in
                    screen offering a way into things you can't reach yet, and the
                    provider consent view — a native layer positioned over this
                    page — needs the full content area to size itself against. */}
                <Route path="/login" element={<Login />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </ChatSessionsProvider>
          </ModelStatusProvider>
        </AppStatusProvider>
      </ProjectProvider>
    </AuthContext.Provider>
  );
}

export default App;
