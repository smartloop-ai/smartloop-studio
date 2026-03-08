import { useState } from 'react';
import { Box, Chip } from '@mui/material';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import { DEFAULT_COLOR } from '@/app/constants';

interface WelcomeScreenProps {
  onNavigateToLogin: () => void;
}

export default function WelcomeScreen({
  onNavigateToLogin,
}: WelcomeScreenProps) {
  const [message, setMessage] = useState('');

  const handleSend = () => {
    // Redirect to login when user tries to send
    onNavigateToLogin();
  };

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'black' }}>
      {/* Top bar with login button */}
      <Box className="flex items-center justify-end px-6 py-4">
        <button
          onClick={onNavigateToLogin}
          className="px-4 py-1.5 rounded-sm border border-gray-700 text-sm text-gray-300 hover:text-white hover:border-pink-500/50 hover:bg-gray-900/50 transition-all"
        >
          Login
        </button>
      </Box>

      {/* Center content */}
      <Box className="flex-1 flex items-center justify-center px-4">
        <Box className="max-w-3xl w-full">
          {/* Logo */}
          <Box className="flex justify-center mb-4">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <span className="text-3xl font-semibold text-white tracking-tight">smartloop</span>
              <span className="text-pink-500 text-3xl font-semibold">.</span>
            </Box>
          </Box>

          {/* Prompt input */}
          <Box className="bg-gray-900/50 border rounded-2xl p-4 relative transition-all border-gray-700 hover:border-pink-500/50">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your prompt (e.g. what is a quantum?)"
              className="w-full bg-transparent text-white placeholder-gray-500 outline-none resize-none"
              style={{ minHeight: '80px' }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />

            <Box className="flex items-center justify-between mt-3">
              {/* Left side - project + attachment */}
              <Box className="flex items-center gap-2">
                <Chip
                  icon={
                    <Box sx={{ width: 10, height: 10, borderRadius: '2px', bgcolor: DEFAULT_COLOR, flexShrink: 0 }} />
                  }
                  label="General Chat"
                  size="small"
                  sx={{
                    height: '28px', borderRadius: '2px',
                    bgcolor: 'rgba(236, 72, 153, 0.08)', color: '#9ca3af',
                    border: '1px solid rgba(107, 114, 128, 0.3)', fontSize: '12px',
                  }}
                />
                <button
                  onClick={onNavigateToLogin}
                  className="flex items-center gap-1.5 px-2 py-1 bg-gray-800/50 border border-gray-700 rounded-sm hover:bg-gray-800/70 hover:border-gray-600 text-gray-400 hover:text-gray-300 transition-all text-xs"
                  style={{ height: '28px' }}
                >
                  <AttachFileIcon sx={{ fontSize: 14 }} />
                  <span>Attach</span>
                </button>
              </Box>

              {/* Send button */}
              <button
                disabled={message.trim().length <= 1}
                className="rounded-full p-2 bg-pink-500 hover:bg-pink-600 disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors shadow-lg flex items-center justify-center"
                onClick={handleSend}
              >
                <ArrowUpwardIcon sx={{ color: '#fff', fontSize: 20 }} />
              </button>
            </Box>
          </Box>

          {/* Fine line + footer */}
          <Box className="mt-6 pt-4 border-t border-gray-800">
            <Box className="text-xs text-gray-500 text-left">
              Ready to assist you with anything you need.
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
