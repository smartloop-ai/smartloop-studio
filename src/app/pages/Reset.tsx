import { Box } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import LockIcon from '@mui/icons-material/Lock';

export default function Reset() {
  const navigate = useNavigate();

  return (
    <Box className="min-h-screen bg-black flex items-center justify-center p-6">
      <Box className="text-center max-w-md">
        <Box className="mb-6">
          <LockIcon sx={{ fontSize: 80, color: 'var(--sl-brand-primary)', mb: 2 }} />
        </Box>

        <h1 className="text-4xl font-bold text-white mb-4">
          Reset Password
        </h1>

        <p className="text-gray-400 text-lg mb-6">
          Create a new password for your account
        </p>

        <Box className="flex gap-4 justify-center flex-col">
          <button
            onClick={() => navigate('/login')}
            className="px-6 py-3 bg-pink-600 hover:bg-pink-500 text-white rounded-lg font-medium transition-all"
          >
            Back to Login
          </button>
        </Box>
      </Box>
    </Box>
  );
}
