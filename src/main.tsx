import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import './app/globals.css';
import App from './App';
import ErrorBoundary from './app/components/error-boundary';
import { AppThemeProvider } from '@/app/contexts/ThemeContext';

// Use HashRouter for Electron (file:// protocol) and BrowserRouter for web
const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron;
const Router = isElectron ? HashRouter : BrowserRouter;

// Polyfill navigator.clipboard for Electron — streamdown's copy/download buttons
// use navigator.clipboard.writeText which is restricted in file:// contexts.
if (isElectron && window.electronAPI?.writeClipboard) {
  Object.defineProperty(navigator, 'clipboard', {
    value: {
      writeText: (text: string) => {
        window.electronAPI!.writeClipboard(text);
        return Promise.resolve();
      },
      readText: () => Promise.resolve(window.electronAPI!.readClipboard?.() ?? ''),
    },
    configurable: true,
  });
}

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
        <AppThemeProvider>
          <Router>
            <App />
          </Router>
        </AppThemeProvider>
      </ErrorBoundary>
    </StrictMode>
  );
}

// Start the app
initializeApp();

