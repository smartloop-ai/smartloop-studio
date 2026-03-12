import { Box } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import EmailIcon from '@mui/icons-material/Email';

export default function Resend() {
  const navigate = useNavigate();

  return (
    <Box className="min-h-screen bg-black flex items-center justify-center p-6">
      <Box className="text-center max-w-md">
        <Box className="mb-6">
          <EmailIcon sx={{ fontSize: 80, color: 'var(--sl-brand-primary)', mb: 2 }} />
        </Box>

        <h1 className="text-4xl font-bold text-white mb-4">
          Resend Verification
        </h1>

        <p className="text-gray-400 text-lg mb-6">
          Resend verification email
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
