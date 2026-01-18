import { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { userService } from '@/app/services/user.service';
import { storageService } from '../services/storage.service';

/**
 * Custom hook for authentication
 * Automatically fetches user and redirects to login/verify if needed
 * Handles invalid or expired tokens by redirecting to login
 * @returns [user, setUser] tuple - user object (or null) and setter function
 */
export function useAuth(): [any, (user: any) => void] {
  const [user, setUser] = useState<any>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const isAuthCheckingRef = useRef(false);

  useEffect(() => {
    // Don't check auth on public pages
    const publicPages = ['/login', '/signup', '/forgot', '/reset', '/verify', '/resend', '/oauth-callback', '/terms'];
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
          console.log('useAuth: No token found, redirecting to login');
          navigate('/login', { replace: true });
          return;
        }

        // Fetch user data
        const u = await userService.get();

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

          // No cached data or invalid cache - redirect to login
          console.log('useAuth: Failed to fetch user and no cached data, redirecting to login');
          userService.logout();
          navigate('/login', { replace: true });
        }
        else {
          // User is authenticated and verified
          setUser(u);

          // Initialize system project if running in Electron
          const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron;
          if (isElectron && window.electronAPI?.initializeSystemProject) {
            try {
              console.log('useAuth: Initializing system project...');
              const result = await window.electronAPI.initializeSystemProject(token);
              if (result.success) {
                if (result.existed) {
                  console.log('useAuth: System project already exists');
                } else {
                  console.log('useAuth: System project created successfully');
                  // Refresh user data to include the new system project
                  const refreshedUser = await userService.get();
                  if (refreshedUser) {
                    setUser(refreshedUser);
                  }
                }
              } else {
                console.error('useAuth: Failed to initialize system project:', result.error);
              }
            } catch (error) {
              console.error('useAuth: Error initializing system project:', error);
            }
          }

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

        // Always redirect to login on other errors to prevent white screens
        console.log('useAuth: Redirecting to login due to error');
        userService.logout();
        navigate('/login', { replace: true });
      } finally {
        isAuthCheckingRef.current = false;
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

  return [user, setUser];
}
