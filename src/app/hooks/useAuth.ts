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
          console.log('useAuth: Failed to fetch user, redirecting to login');
          userService.logout();
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

        // Always redirect to login on any error to prevent white screens
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
