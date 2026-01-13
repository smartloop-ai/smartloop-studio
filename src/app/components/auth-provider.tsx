import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { userService } from '@/app/services/user.service';
import LoadingSpinner from './loading-spinner';

interface AuthProviderProps {
  children: React.ReactNode;
}

/**
 * AuthProvider component
 * Performs initial authentication check on app load
 * Calls /users/me and redirects to login if 401 is returned
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const [isChecking, setIsChecking] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const checkAuth = async () => {
      // Public pages that don't require authentication
      const publicPages = ['/login', '/signup', '/forgot', '/reset', '/verify', '/resend', '/oauth-callback', '/terms'];

      if (publicPages.includes(location.pathname)) {
        setIsChecking(false);
        return;
      }

      try {
        // Check if token exists
        const token = userService.token();

        if (!token) {
          console.log('AuthProvider: No token found, redirecting to login');
          navigate('/login', { replace: true });
          setIsChecking(false);
          return;
        }

        // Call /users/me to verify token
        const user = await userService.get();

        if (!user) {
          // Token is invalid or expired (401 handled in userService)
          console.log('AuthProvider: Invalid token, redirecting to login');
          navigate('/login', { replace: true });
        } else if (user.verified === false) {
          // User exists but not verified
          console.log('AuthProvider: User not verified, redirecting to verify');
          navigate('/verify', { replace: true });
        } else {
          // User is authenticated and verified
          console.log('AuthProvider: User authenticated successfully');

          // Initialize token refresh in the background
          userService.initializeTokenRefresh();
        }
      } catch (error: any) {
        console.error('AuthProvider: Error during authentication check:', error);

        // On any error (including 401), redirect to login
        console.log('AuthProvider: Redirecting to login due to error');
        userService.logout();
        navigate('/login', { replace: true });
      } finally {
        setIsChecking(false);
      }
    };

    checkAuth();
  }, [navigate, location.pathname]);

  // Show loading spinner while checking authentication
  if (isChecking) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: '#000000'
      }}>
        <LoadingSpinner />
      </div>
    );
  }

  return <>{children}</>;
}
