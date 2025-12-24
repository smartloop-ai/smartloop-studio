import { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { userService } from '@/app/services/user.service';

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
        // Check if token exists
        const token = userService.token();
        if (!token) {
          console.log('useAuth: No token found, redirecting to login');
          navigate('/login', { replace: true });
          return;
        }

        // Fetch user data
        const u = await userService.get();

        if (!u) {
          // Token is invalid or expired (401 handled in userService)
          console.log('useAuth: Failed to fetch user, likely invalid/expired token');
          // userService.get() already handles logout and redirect on 401
          // But we'll ensure redirect happens
          navigate('/login', { replace: true });
        } else if (u.verified === false) {
          // User exists but not verified
          console.log('useAuth: User not verified, redirecting to verify');
          navigate('/verify', { replace: true });
        } else {
          // User is authenticated and verified
          setUser(u);
        }
      } catch (error: any) {
        console.error('useAuth: Error during authentication check:', error);

        // Handle different error types
        if (error.message === 'Network error') {
          // Network error - could be offline
          console.error('useAuth: Network error, unable to verify token');
          // Try to load cached user from localStorage as fallback
          try {
            const cachedUser = localStorage.getItem('u');
            if (cachedUser) {
              const parsedUser = JSON.parse(cachedUser);
              console.log('useAuth: Using cached user data due to network error');
              setUser(parsedUser);
              return;
            }
          } catch (e) {
            console.error('useAuth: Error parsing cached user:', e);
          }
        }

        // For any other error or if no cached user, redirect to login
        console.log('useAuth: Redirecting to login due to error');
        userService.logout();
        navigate('/login', { replace: true });
      } finally {
        isAuthCheckingRef.current = false;
      }
    };

    checkAuth();
  }, [navigate, location.pathname]);

  return [user, setUser];
}
