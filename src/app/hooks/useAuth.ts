import { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { userService } from '@/app/services/user.service';
import { projectService } from '@/app/services/project.service';
import { storageService } from '../services/storage.service';

/**
 * Custom hook for authentication
 * Automatically fetches user and redirects to login/verify if needed
 * Handles invalid or expired tokens by redirecting to login
 * @returns [user, setUser] tuple - user object (or null) and setter function
 */
export function useAuth(): [any, (user: any) => void, boolean] {
  const [user, setUser] = useState<any>(null);
  const [authReady, setAuthReady] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const isAuthCheckingRef = useRef(false);

  useEffect(() => {
    // Don't check auth on public pages
    const publicPages = ['/welcome', '/login', '/signup', '/forgot', '/reset', '/verify', '/resend', '/oauth-callback', '/terms'];
    if (publicPages.includes(location.pathname)) {
      return;
    }

    // Prevent multiple simultaneous auth checks
    if (isAuthCheckingRef.current) {
      return;
    }

    isAuthCheckingRef.current = true;

    const checkAuth = async () => {
      try {
        // Check if token exists in localStorage
        let token = await userService.token();

        // If running in Electron, check persistent storage
        const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron;
        if (!token && isElectron && window.electronAPI) {
          console.log('useAuth: Token not in localStorage, checking persistent storage...');
          token = await storageService.getItem('token');
        }

        if (!token) {
          // No token — in Electron, create guest user with local SLP projects
          if (isElectron) {
            let mappedProjects: any[] = [];
            try {
              const localProjectsResult = await projectService.getProjects();
              if (localProjectsResult.success && localProjectsResult.data) {
                const localProjects: any[] = localProjectsResult.data.projects || localProjectsResult.data;
                mappedProjects = localProjects.map((p: any) => ({
                  ...p,
                  title: p.title || p.name,
                  documents: p.documents || [],
                  config: p.config || { rules: '', memory: true },
                }));
              }
            } catch (err) {
              console.warn('useAuth: Could not load local projects for guest mode:', err);
            }
            // Ensure a system project exists for guest users
            const hasSystemProject = mappedProjects.some((p: any) => p.system === true);
            if (!hasSystemProject) {
              mappedProjects.unshift({
                id: 'general',
                title: 'General Chat',
                name: 'General Chat',
                system: true,
                documents: [],
                config: { rules: '', memory: true },
              });
            }
            console.log(`useAuth: Guest mode — loaded ${mappedProjects.length} project(s) from local SLP`);
            setUser({ name: 'Guest', guest: true, projects: mappedProjects, conversations: [] });
            return;
          }
          // Not in Electron — redirect to welcome page
          if (location.pathname !== '/welcome') {
            navigate('/welcome', { replace: true });
          }
          return;
        }

        // Fetch user data
        let u = await userService.get();

        if (!u) {
          // Could be network error or invalid token
          // Check if we have cached user data
          const cachedUser = await storageService.getItem('u');
          if (cachedUser) {
            try {
              const parsedUser = JSON.parse(cachedUser);
              // Ensure conversations is always an array, never null
              if (!parsedUser.conversations || !Array.isArray(parsedUser.conversations)) {
                parsedUser.conversations = [];
              }
              console.log('useAuth: Using cached user data due to network error');
              setUser(parsedUser);
              // Don't redirect - allow user to continue with cached data
              return;
            } catch (e) {
              console.error('useAuth: Error parsing cached user:', e);
            }
          }

          // No cached data or invalid cache - redirect to welcome screen
          console.log('useAuth: Failed to fetch user and no cached data, redirecting to welcome');
          userService.logout();
          navigate('/welcome', { replace: true });
        }
        else {
          // Always use local SLP as the source of truth for projects in Electron
          if (isElectron) {
            try {
              const localProjectsResult = await projectService.getProjects();
              if (localProjectsResult.success && localProjectsResult.data) {
                const localProjects: any[] = localProjectsResult.data.projects || localProjectsResult.data;
                const mappedProjects = localProjects.map((p: any) => ({
                  ...p,
                  title: p.title || p.name,
                  documents: p.documents || [],
                  config: p.config || { rules: '', memory: true },
                }));
                // Ensure a system project exists
                const hasSystemProject = mappedProjects.some((p: any) => p.system === true);
                if (!hasSystemProject) {
                  mappedProjects.unshift({
                    id: 'general',
                    title: 'General Chat',
                    name: 'General Chat',
                    system: true,
                    documents: [],
                    config: { rules: '', memory: true },
                  });
                }
                console.log(`useAuth: Loaded ${mappedProjects.length} project(s) from local SLP`);
                u = { ...u, projects: mappedProjects };
              }
            } catch (err) {
              console.warn('useAuth: Could not load projects from local SLP:', err);
            }
          }

          setUser(u);

          // Initialize token refresh in the background
          userService.initializeTokenRefresh();
        }
      } catch (error: any) {
        console.error('useAuth: Error during authentication check:', error);

        // Check if we have cached user data for network errors
        if (error.message?.includes('Network error') || error.message?.includes('fetch')) {
          const cachedUser = await storageService.getItem('u');
          if (cachedUser) {
            try {
              const parsedUser = JSON.parse(cachedUser);
              // Ensure conversations is always an array, never null
              if (!parsedUser.conversations || !Array.isArray(parsedUser.conversations)) {
                parsedUser.conversations = [];
              }
              console.log('useAuth: Using cached user data due to network error');
              setUser(parsedUser);
              return; // Don't redirect on network errors if we have cache
            } catch (e) {
              console.error('useAuth: Error parsing cached user:', e);
            }
          }
        }

        // Redirect to welcome screen on other errors
        console.log('useAuth: Redirecting to welcome screen due to error');
        userService.logout();
        navigate('/welcome', { replace: true });
      } finally {
        isAuthCheckingRef.current = false;
        setAuthReady(true);
      }
    };

    checkAuth();
  }, [navigate, location.pathname]);

  // Listen for userUpdated events (e.g., when a project is created)
  useEffect(() => {
    const handleUserUpdated = (event: CustomEvent) => {
      if (event.detail) {
        setUser(event.detail);
      }
    };

    window.addEventListener('userUpdated', handleUserUpdated as EventListener);
    return () => {
      window.removeEventListener('userUpdated', handleUserUpdated as EventListener);
    };
  }, []);

  return [user, setUser, authReady];
}
