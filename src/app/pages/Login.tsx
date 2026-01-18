import '../styles/login.css';

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Box, CircularProgress } from '@mui/material';
import { APP_URL, API_BASE_URL } from '@/app/constants';
import { storageService } from '@/app/services/storage.service';

export default function Login() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron;

  // Listen for OAuth callback in Electron
  useEffect(() => {
    if (isElectron && window.electronAPI) {
      // Remove any existing listeners first to prevent duplicates
      window.electronAPI.removeOAuthCallbackListener?.();

      window.electronAPI.onOAuthCallback(async ({ accessToken, error }) => {
        console.log('OAuth callback received:', { accessToken: accessToken ? 'present' : 'missing', error });

        if (error) {
          setErrorMessage(error);
          setIsLoading(false);
          setStatusMessage("");
          return;
        }

        if (accessToken) {
          setStatusMessage("Validating token...");

          // Validate the token
          if (window.electronAPI) {
            const validation = await window.electronAPI.validateToken(accessToken);

            if (validation.valid) {
              await storageService.setItem('token', accessToken);

              // Store user data if provided
              if (validation.user) {
                const userData = JSON.stringify(validation.user);
                await storageService.setItem('u', userData);
              }

              // Note: Don't start token refresh here - useAuth will start it
              // after verifying the token. Starting it here causes a race condition
              // where the refresh can invalidate the token before navigation completes.

              setStatusMessage("Success! Redirecting...");

              // Navigate to home - use replace to avoid back button issues
              setTimeout(() => {
                navigate('/', { replace: true });
              }, 500);
            } else {
              setErrorMessage(validation.error || 'Token validation failed. Please try again.');
              setIsLoading(false);
              setStatusMessage("");
            }
          }
        }
      });

      // Cleanup listener on unmount
      return () => {
        window.electronAPI?.removeOAuthCallbackListener?.();
      };
    }
  }, [isElectron, navigate]);

  // Check if already logged in
  useEffect(() => {
    const checkExistingToken = async () => {
      const token = await storageService.getItem('token');

      if (token) {
        // Optionally validate the token before redirecting
        if (isElectron && window.electronAPI) {
          const validation = await window.electronAPI.validateToken(token);
          if (validation.valid) {
            navigate('/', { replace: true });
          } else {
            await storageService.removeItem('token');
            await storageService.removeItem('u');
          }
        } else {
          navigate('/', { replace: true });
        }
      }
    };
    checkExistingToken();
  }, [navigate, isElectron]);

  const handleLogin = async () => {
    setErrorMessage("");
    setStatusMessage("");
    setIsLoading(true);

    try {
      if (isElectron && window.electronAPI) {
        // Electron OAuth flow - opens system browser
        setStatusMessage("Opening browser for authentication...");
        await window.electronAPI.oauthLogin();
        setStatusMessage("Waiting for authentication...");

        // The callback will be handled by the onOAuthCallback listener
        // Keep loading state until we get the callback
      } else {
        setStatusMessage("Redirecting to authentication...");
        const apiUrl = encodeURIComponent(API_BASE_URL);
        window.location.href = `${APP_URL}/login?mode=native&app_url=${apiUrl}`;
      }
    } catch (error: any) {
      console.error('Login error:', error);
      setErrorMessage(error.message || 'Authentication failed. Please try again.');
      setIsLoading(false);
      setStatusMessage("");
    }
  };

  return (
    <Box className="min-h-screen bg-black flex flex-col items-center justify-center p-6">
      {/* Logo */}
      <Box className="mb-12">
        <Box className="flex items-center gap-0 justify-center">
          <span className="text-4xl font-bold text-white">smartloop</span>
          <span className="text-pink-500 text-4xl font-bold rounded-full">.</span>
        </Box>

      </Box>

      {/* Login Card */}
      <Box
        sx={{
          maxWidth: '400px',
          width: '100%',
          bgcolor: '#0a0a0a',
          border: '1px solid #1a1a1a',
          borderRadius: '16px',
          padding: '48px',
          textAlign: 'center',
        }}
      >
        <h1 className="text-2xl font-normal text-white mb-8">Welcome</h1>

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
              ? '#6b7280'
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
          <p className="text-xs text-gray-500">
            By logging in, you agree to our{' '}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                navigate('/terms');
              }}
              className="underline hover:text-white cursor-pointer"
            >
              Terms and Privacy Policy
            </a>
          </p>
        </Box>
        {/* Sign Up Link */}
        <Box className="mt-6 pt-6 border-t border-gray-800">
          <p className="text-sm text-gray-400">
            Don't have an account?{' '}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                window.open('https://app.smartloop.ai/signup?mode=native', '_blank');
              }}
              className="text-pink-500 hover:text-pink-400 font-medium cursor-pointer"
            >
              Sign up
            </a>
          </p>
        </Box>
      </Box>

      {/* Footer Info */}
      <Box className="mt-8 text-center">
        <p className="text-sm text-gray-600">
          {isElectron ? 'Studio Application' : 'Web Application'}
        </p>
        {isElectron && isLoading && (
          <p className="text-xs text-gray-700 mt-2">
            Complete the login in your browser, then return to this app
          </p>
        )}
      </Box>
    </Box>
  );
}
