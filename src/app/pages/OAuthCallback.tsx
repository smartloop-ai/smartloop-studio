import { Box, CircularProgress } from '@mui/material';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function OAuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    // After a delay, redirect to home (in real implementation, handle OAuth here)
    const timer = setTimeout(() => {
      navigate('/');
    }, 2000);

    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <Box className="min-h-screen bg-black flex items-center justify-center p-6">
      <Box className="text-center">
        <CircularProgress sx={{ color: 'var(--sl-brand-primary)', mb: 4 }} size={60} />
        <h1 className="text-2xl font-bold text-white mb-2">
          Processing Authentication
        </h1>
        <p className="text-gray-400">
          Please wait...
        </p>
      </Box>
    </Box>
  );
}
