import '../styles/login.css';

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Box, CircularProgress, IconButton } from '@mui/material';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import { APP_URL } from '@/app/constants';

export default function Login() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron;

  // Check if already authenticated via local service
  useEffect(() => {
    const checkAuthStatus = async () => {
      if (isElectron && window.electronAPI?.slpAuthStatus) {
        try {
          const status = await window.electronAPI.slpAuthStatus();
          if (status?.success && status?.has_access_token) {
            navigate('/', { replace: true });
          }
        } catch {
          // Not authenticated, stay on login page
        }
      }
    };
    checkAuthStatus();
  }, [navigate, isElectron]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, []);

  const startPollingAuthStatus = () => {
    // Poll auth/status every 2 seconds until authenticated
    pollRef.current = setInterval(async () => {
      try {
        if (!window.electronAPI?.slpAuthStatus) return;
        const status = await window.electronAPI.slpAuthStatus();
        if (status?.success && status?.has_access_token) {
          // Authenticated! Stop polling.
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
          // Broadcast the auth change so views (e.g. Settings) force-refresh
          // per-user model entitlement (is_accessible) instead of showing the
          // stale, pre-login cache. Fetch the full profile first (includes
          // is_paid) to match the sidebar's login flow.
          try {
            const profileResult = await window.electronAPI?.slpFetchUser?.({ force: true });
            const fullUser = profileResult?.success && profileResult.user
              ? { ...status.user, ...profileResult.user }
              : status?.user;
            window.dispatchEvent(new CustomEvent('authStateChanged', { detail: { loggedIn: true, user: fullUser } }));
          } catch { /* non-fatal — navigation still proceeds */ }
          setStatusMessage("Success! Redirecting...");
          setTimeout(() => {
            navigate('/', { replace: true });
          }, 500);
        }
      } catch {
        // Keep polling
      }
    }, 2000);
  };

  const handleLogin = async () => {
    setErrorMessage("");
    setStatusMessage("");
    setIsLoading(true);

    try {
      if (isElectron && window.electronAPI) {
        setStatusMessage("Opening browser for authentication...");
        const result = await window.electronAPI.oauthLogin();

        if (result?.status === 'error') {
          setErrorMessage(result.error || 'Local service not running. Please try again.');
          setIsLoading(false);
          setStatusMessage("");
          return;
        }

        setStatusMessage("Waiting for authentication...");
        startPollingAuthStatus();
      } else {
        setStatusMessage("Redirecting to authentication...");
        window.location.href = `${APP_URL}/login/?mode=desktop`;
      }
    } catch (error: any) {
      console.error('Login error:', error);
      setErrorMessage(error.message || 'Authentication failed. Please try again.');
      setIsLoading(false);
      setStatusMessage("");
    }
  };

  return (
    <Box className="min-h-screen bg-sl-bg-base flex flex-col items-center justify-center p-6 relative">
      {/* Home icon */}
      <IconButton
        onClick={() => navigate('/', { replace: true })}
        sx={{ position: 'absolute', top: 16, right: 16, color: 'var(--sl-text-muted)', '&:hover': { color: 'var(--sl-text-primary)' } }}
      >
        <HomeOutlinedIcon />
      </IconButton>

      {/* Logo */}
      <Box className="mb-12">
        <Box className="flex items-center gap-0 justify-center">
          <span className="text-4xl font-bold text-sl-text-primary">smartloop</span>
          <span className="text-4xl font-bold rounded-full" style={{ color: 'var(--sl-brand-primary)' }}>.</span>
        </Box>

      </Box>

      {/* Login Card */}
      <Box
        sx={{
          maxWidth: '400px',
          width: '100%',
          bgcolor: 'var(--sl-bg-base)',
          border: '1px solid var(--sl-bg-surface-1)',
          borderRadius: '16px',
          padding: '48px',
          textAlign: 'center',
        }}
      >
        <h1 className="text-2xl font-normal text-sl-text-primary mb-8">Welcome</h1>

        {errorMessage.length > 0 && (
          <Box className="mb-6 p-3 bg-red-900 bg-opacity-20 border border-red-800 rounded-lg">
            <p className="text-red-400 text-sm">{errorMessage}</p>
          </Box>
        )}

        {statusMessage.length > 0 && (
          <Box className="mb-6 p-3 bg-blue-900 bg-opacity-20 border border-blue-800 rounded-lg">
            <p className="text-blue-400 text-sm">{statusMessage}</p>
          </Box>
        )}

        {/* Login Button */}
        <button
          onClick={handleLogin}
          disabled={isLoading}
          className="w-full py-4 rounded-lg font-medium transition-all text-lg"
          style={{
            background: isLoading
              ? 'var(--sl-text-disabled)'
              : 'linear-gradient(to right, #e9d5ff, #ddd6fe)',
            color: '#1f2937',
            cursor: isLoading ? 'not-allowed' : 'pointer',
          }}
        >
          {isLoading ? (
            <Box className="flex items-center justify-center gap-2">
              <CircularProgress size={20} sx={{ color: '#1f2937' }} />
              <span>Authenticating...</span>
            </Box>
          ) : (
            'Login with Smartloop'
          )}
        </button>

        <Box className="mt-8 text-center">
          <p className="text-xs text-sl-text-disabled">
            By logging in, you agree to our{' '}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                navigate('/terms');
              }}
              className="underline hover:text-sl-text-primary cursor-pointer"
            >
              Terms and Privacy Policy
            </a>
          </p>
        </Box>
        {/* Sign Up Link */}
        <Box className="mt-6 pt-6 border-t border-sl-border-default">
          <p className="text-sm text-sl-text-muted">
            Don't have an account?{' '}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                window.open('https://app.smartloop.ai/signup?mode=native', '_blank');
              }}
              className="font-medium cursor-pointer"
              style={{ color: 'var(--sl-brand-primary)' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--sl-brand-light)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--sl-brand-primary)')}
            >
              Sign up
            </a>
          </p>
        </Box>
      </Box>

      {/* Footer Info */}
      <Box className="mt-8 text-center">
        <p className="text-sm text-sl-text-faint">
          {isElectron ? 'Studio Application' : 'Web Application'}
        </p>
        {isElectron && isLoading && (
          <p className="text-xs text-sl-text-faint mt-2">
            Complete the login in your browser, then return to this app
          </p>
        )}
      </Box>
    </Box>
  );
}
