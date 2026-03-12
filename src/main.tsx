import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import './app/globals.css';
import App from './App';
import ErrorBoundary from './app/components/error-boundary';
import { colors } from '@/app/theme/colors';

// Use HashRouter for Electron (file:// protocol) and BrowserRouter for web
const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron;
const Router = isElectron ? HashRouter : BrowserRouter;

// Global handler for network-related errors (chunk loading failures, etc.)
window.addEventListener('error', (event) => {
  const networkErrorPatterns = ['ERR_NETWORK_CHANGED', 'ERR_INTERNET_DISCONNECTED', 'ChunkLoadError', 'Loading chunk', 'net::'];
  const errorMessage = event.message || '';
  if (networkErrorPatterns.some(pattern => errorMessage.includes(pattern))) {
    console.warn('Network error detected, suppressing:', errorMessage);
    event.preventDefault();
  }
});

window.addEventListener('unhandledrejection', (event) => {
  const networkErrorPatterns = ['ERR_NETWORK_CHANGED', 'ERR_INTERNET_DISCONNECTED', 'Failed to fetch', 'NetworkError', 'ChunkLoadError'];
  const reason = event.reason?.message || event.reason?.toString() || '';
  if (networkErrorPatterns.some(pattern => reason.includes(pattern))) {
    console.warn('Network-related promise rejection, suppressing:', reason);
    event.preventDefault();
  }
});

// Create a dark theme for Material-UI
const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: colors.brand.primary,
    },
    background: {
      default: colors.bg.base,
      paper: colors.bg.base,
    },
  },
  components: {
    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundColor: colors.bg.base,
          backgroundImage: 'none',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundColor: colors.bg.base,
          backgroundImage: 'none',
        },
      },
    },
  },
});

// Initialize app - load token from persistent storage if in Electron
async function initializeApp() {
  // If running in Electron, load token and user data from electron-store to persistent storage
  // This ensures tokens persist across app restarts
  if (isElectron && window.electronAPI) {
    try {
      const storedToken = await window.electronAPI.storageGet('token');
      const storedUser = await window.electronAPI.storageGet('u');

      if (storedToken) {
        console.log('[App Init] Loading token from persistent storage');
        await window.electronAPI.storageSet('token', storedToken);
      }

      if (storedUser) {
        console.log('[App Init] Loading user data from persistent storage');
        await window.electronAPI.storageSet('u', storedUser);
      }
    } catch (error) {
      console.error('[App Init] Error loading from persistent storage:', error);
    }
  }

  // Render the app
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <Router>
            <App />
          </Router>
        </ThemeProvider>
      </ErrorBoundary>
    </StrictMode>
  );
}

// Start the app
initializeApp();

