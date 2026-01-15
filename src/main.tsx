import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import './app/globals.css';
import App from './App';
import ErrorBoundary from './app/components/error-boundary';

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
      main: '#ec4899', // Pink
    },
    background: {
      default: '#000000',
      paper: '#000000',
    },
  },
  components: {
    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundColor: '#000000',
          backgroundImage: 'none',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundColor: '#000000',
          backgroundImage: 'none',
        },
      },
    },
  },
});

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

