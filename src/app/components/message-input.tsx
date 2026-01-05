import { useRef } from 'react';
import { Box, CircularProgress, InputBase, InputAdornment } from '@mui/material';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import FileAttacher from './file-attacher';

interface MessageInputProps {
  message: string;
  onMessageChange: (message: string) => void;
  onSend: () => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  placeholder?: string;
  disabled?: boolean;
  isLoading?: boolean;
  allowAttachments?: boolean;
  conversationId?: string | null;
  onFileAttached?: (documentId: string, fileName: string) => void;
  clearAttachmentTrigger?: number;
  showDragDrop?: boolean;
  minRows?: number;
  maxRows?: number;
}

export default function MessageInput({
  message,
  onMessageChange,
  onSend,
  onKeyDown,
  placeholder = "Enter your prompt...",
  disabled = false,
  isLoading = false,
  allowAttachments = false,
  conversationId = null,
  onFileAttached,
  clearAttachmentTrigger = 0,
  showDragDrop = false,
  minRows = 1,
  maxRows = 4,
}: MessageInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleKeyDownInternal = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && !isLoading && message.trim()) {
        onSend();
      }
    }
    if (onKeyDown) {
      onKeyDown(e);
    }
  };

  return (
    <Box>
      <Box
        className="px-4 md:px-6 py-3 md:py-4 border rounded-lg shadow-lg transition-all relative border-gray-800"
        sx={{
          bgcolor: 'rgba(17, 24, 39, 0.5)',
          borderLeft: '3px solid #ec4899',
        }}
      >
        <InputBase
          inputRef={inputRef}
          name="message"
          autoComplete="off"
          placeholder={isLoading ? "Thinking..." : placeholder}
          type="text"
          multiline={true}
          minRows={minRows}
          maxRows={maxRows}
          value={message}
          onChange={(e) => onMessageChange(e.target.value)}
          fullWidth
          disabled={disabled || isLoading}
          className="w-full text-inherit mb-3"
          onKeyDown={handleKeyDownInternal}
          startAdornment={
            isLoading ? (
              <InputAdornment position="start">
                <AutoAwesomeIcon sx={{ color: '#ec4899', fontSize: 18, mr: 0.5 }} />
              </InputAdornment>
            ) : null
          }
          sx={{
            border: 'none',
            height: '100%',
            fontSize: '15px',
            lineHeight: '1.5',
            '& .MuiInputBase-input': {
              caretColor: '#ec4899',
            },
            '& .MuiInputBase-input.Mui-disabled': {
              color: '#9ca3af !important',
              WebkitTextFillColor: '#9ca3af !important',
            },
            '& .MuiInputBase-input::placeholder': {
              color: '#4b5563',
              opacity: 1
            },
            '& .MuiInputBase-input.Mui-disabled::placeholder': {
              color: '#9ca3af !important',
              opacity: '1 !important',
              WebkitTextFillColor: '#9ca3af !important',
            },
          }}
        />

        <Box className="flex items-center justify-between">
          {/* Left side - File attachment */}
          <Box className="flex items-center gap-2">
            {allowAttachments && conversationId && (
              <FileAttacher
                conversationId={conversationId}
                onSuccess={(documentId, fileName) => {
                  if (onFileAttached) {
                    onFileAttached(documentId, fileName);
                  }
                }}
                onError={(error) => {
                  console.error('File upload error:', error);
                }}
                disabled={disabled || isLoading}
                size="small"
                showDragDrop={showDragDrop}
                clearTrigger={clearAttachmentTrigger}
              />
            )}
          </Box>

          {/* Right side - Send button */}
          <button
            disabled={disabled || isLoading || !message.trim()}
            className="p-2 md:p-3 rounded-lg bg-pink-500 hover:bg-pink-600 disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors shadow-lg"
            onClick={onSend}
          >
            {isLoading ? (
              <CircularProgress size={20} sx={{ color: '#fff' }} />
            ) : (
              <ArrowUpwardIcon sx={{ color: '#fff', fontSize: { xs: 18, md: 20 } }} />
            )}
          </button>
        </Box>
      </Box>
    </Box>
  );
}
