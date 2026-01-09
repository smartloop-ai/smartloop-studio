import { StrictMode } from 'react';
import {createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import './app/globals.css';
import App from './App';

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
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>
);

