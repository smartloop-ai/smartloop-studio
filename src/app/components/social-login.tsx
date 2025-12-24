
import { Box, IconButton } from '@mui/material';
import GitHubIcon from '@mui/icons-material/GitHub';
import AppleIcon from '@mui/icons-material/Apple';
import { API_ENDPOINT } from '@/app/constants';
import GoogleIcon from '/img/google-symbol.svg';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function SocialLogin(props: { onError: any, searchParams?: URLSearchParams }) {
  const navigate = useNavigate();
  const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron;

  // Listen for OAuth callback in Electron
  useEffect(() => {
    if (isElectron && window.electronAPI) {
      window.electronAPI.onOAuthCallback(({ accessToken, error }) => {
        console.log('OAuth callback received in Electron:', accessToken);

        if (error) {
          props.onError(error);
          return;
        }

        // Store the access token
        if (accessToken) {
          localStorage.setItem('token', accessToken);

          // Navigate to home
          navigate('/');
        }
      });
    }
  }, [isElectron, navigate]);

  // Handle OAuth login for Electron
  const handleElectronOAuth = async () => {
    try {
      if (window.electronAPI) {
        // Just trigger the OAuth flow - token comes via callback
        await window.electronAPI.oauthLogin();

        // The token will be received via onOAuthCallback listener
        // which was set up in useEffect
      }
    } catch (error) {
      console.error('Electron OAuth error:', error);
      props.onError(`An error occurred while trying to log in.`);
    }
  };

  // Handle OAuth login for web (existing flow)
  const handleWebOAuth = async (_: React.MouseEvent<HTMLAnchorElement>, provider: string) => {
    props.onError("");

    try {
      let url = `${API_ENDPOINT}/auth/${provider}/authorize`;

      // If we have CLI OAuth parameters, store them in localStorage
      if (props.searchParams) {
        const redirectUri = props.searchParams.get('redirect_uri');
        const clientId = props.searchParams.get('client_id');
        const state = props.searchParams.get('state');
        const responseType = props.searchParams.get('response_type');

        // Store OAuth parameters in localStorage for later retrieval only if this is an OAuth flow
        if (redirectUri && clientId) {
          // Clear any existing parameters first
          localStorage.removeItem('cli_redirect_uri');
          localStorage.removeItem('cli_client_id');
          localStorage.removeItem('cli_state');
          localStorage.removeItem('cli_response_type');

          // Store new parameters
          localStorage.setItem('cli_redirect_uri', redirectUri);
          localStorage.setItem('cli_client_id', clientId);

          if (state) {
            localStorage.setItem('cli_state', state);
          }

          if (responseType) {
            localStorage.setItem('cli_response_type', responseType);
          }

          // Also add to URL for server-side processing
          url += `?cli_redirect_uri=${encodeURIComponent(redirectUri)}`;
          url += `&cli_client_id=${encodeURIComponent(clientId)}`;

          if (state) {
            url += `&cli_state=${encodeURIComponent(state)}`;
          }

          if (responseType) {
            url += `&cli_response_type=${encodeURIComponent(responseType)}`;
          }
        } else {
          // Not an OAuth flow, clear any leftover parameters
          localStorage.removeItem('cli_redirect_uri');
          localStorage.removeItem('cli_client_id');
          localStorage.removeItem('cli_state');
          localStorage.removeItem('cli_response_type');
        }
      }

      const options = {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      };

      const response = await fetch(url, options);

      if (response.ok) {
        const result = await response.json();

        if (result.authorization_url) {
          // Forward to provider login flow
          window.location.href = result.authorization_url;
        } else {
          props.onError(`Failed to fetch ${provider} login URL.`);
        }
      } else {
        props.onError("Failed to contact the server.");
      }
    } catch (error) {
      props.onError(`An error occurred while trying to log in with ${provider}.`);
      console.error(`${provider} login error:`, error);
    }
  };

  // Unified handler that routes to Electron or web OAuth
  const handleOauthLogin = async (e: React.MouseEvent<HTMLAnchorElement>, provider: string) => {
    e.preventDefault();

    if (isElectron) {
      await handleElectronOAuth();
    } else {
      await handleWebOAuth(e, provider);
    }
  };

  return (
    <Box className="flex gap-3 mb-6">
      {/* Continue with Google Button */}
      <button
        type="button"
        onClick={(e: any) => handleOauthLogin(e, "google")}
        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-white hover:bg-gray-100 text-black rounded-lg font-medium transition-colors"
      >
        <img src={GoogleIcon} alt="google" style={{ width: '20px', height: '20px' }} />
        <span>Continue with Google</span>
      </button>

      {/* Apple Icon Button */}
      <IconButton
        type="button"
        className="bg-white text-black"
        onClick={(e: any) => {
          e.preventDefault();
          handleOauthLogin(e, "apple");
        }}
        sx={{
          borderRadius: '8px',
          width: '48px',
          height: '48px',
          '&:hover': {
            bgcolor: '#f3f4f6',
          },
        }}
      >
        <AppleIcon sx={{ fontSize: 20 }} />
      </IconButton>

      {/* GitHub Icon Button */}
      <IconButton
        type="button"
        onClick={(e: any) => {
          e.preventDefault();
          handleOauthLogin(e, "github");
        }}
        sx={{
          bgcolor: 'white',
          borderRadius: '8px',
          width: '48px',
          height: '48px',
          color: 'black',
          '&:hover': {
            bgcolor: '#f3f4f6',
          },
        }}
      >
        <GitHubIcon sx={{ fontSize: 20 }} />
      </IconButton>
    </Box>
  )
}
