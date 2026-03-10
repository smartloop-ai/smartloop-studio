import { useRef, useEffect } from 'react';
import { Box, InputBase, InputAdornment } from '@mui/material';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CloseIcon from '@mui/icons-material/Close';
import FormatQuoteIcon from '@mui/icons-material/FormatQuote';
import FileAttacher from './file-attacher';

interface MessageInputProps {
  message: string;
  onMessageChange: (message: string) => void;
  onSend: () => void;
  onStop?: () => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  placeholder?: string;
  disabled?: boolean;
  isLoading?: boolean;
  allowAttachments?: boolean;
  conversation?: any;
  onFileAttached?: (documentId: string, fileName: string) => void;
  onAttachmentClear?: () => void;
  clearAttachmentTrigger?: number;
  showDragDrop?: boolean;
  minRows?: number;
  maxRows?: number;
  selectedQuote?: string;
  onQuoteClear?: () => void;
}

export default function MessageInput({
  message,
  onMessageChange,
  onSend,
  onStop,
  onKeyDown,
  placeholder = "Enter your prompt...",
  disabled = false,
  isLoading = false,
  allowAttachments = false,
  conversation = null,
  onFileAttached,
  onAttachmentClear,
  clearAttachmentTrigger = 0,
  showDragDrop = false,
  minRows = 1,
  maxRows = 4,
  selectedQuote = "",
  onQuoteClear,
}: MessageInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Global Escape key listener to stop generation (input is disabled during loading)
  const onStopRef = useRef(onStop);
  onStopRef.current = onStop;

  useEffect(() => {
    if (!isLoading) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onStopRef.current) {
        e.preventDefault();
        onStopRef.current();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isLoading]);

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
        className="px-4 md:px-6 py-3 md:py-4 rounded-lg shadow-lg transition-all relative"
        sx={{
          bgcolor: 'rgba(17, 24, 39, 0.5)',
          border: '1px solid #1f2937',
          '&:focus-within': {
            border: '1px solid rgba(255, 255, 255, 0.3)',
          },
        }}
      >
        <InputBase
          inputRef={inputRef}
          name="message"
          autoComplete="off"
          placeholder={isLoading ? "Generating response..." : placeholder}
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
          {/* Left side - File attachment and selected quote */}
          <Box className="flex items-center gap-2 flex-1 overflow-hidden">
            {allowAttachments && (
              <FileAttacher
                conversation={conversation}
                onSuccess={(documentId, fileName) => {
                  if (onFileAttached) {
                    onFileAttached(documentId, fileName);
                  }
                }}
                onClear={() => {
                  if (onAttachmentClear) {
                    onAttachmentClear();
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
            {/* Selected quote indicator */}
            {selectedQuote && (
              <Box
                className="flex items-center gap-1.5 px-2 py-1 bg-gray-800/80 text-xs text-gray-300 border border-gray-700/50 max-w-[200px] md:max-w-[300px]"
                sx={{ flexShrink: 0 }}
              >
                <FormatQuoteIcon sx={{ fontSize: 14, color: '#ec4899', flexShrink: 0 }} />
                <span className="truncate" title={selectedQuote}>
                  {selectedQuote.length > 40 ? selectedQuote.substring(0, 40) + '...' : selectedQuote}
                </span>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (onQuoteClear) {
                      onQuoteClear();
                    }
                  }}
                  className="p-0.5 hover:bg-gray-700 rounded transition-colors flex-shrink-0"
                  title="Remove quote"
                >
                  <CloseIcon sx={{ fontSize: 12, color: '#9ca3af' }} />
                </button>
              </Box>
            )}
          </Box>

          {/* Right side - Send / Stop button */}
          {isLoading ? (
            <button
              className="p-2 md:p-3 rounded-lg transition-colors shadow-lg"
              style={{
                backgroundColor: 'rgba(236, 72, 153, 0.15)',
                border: '1.5px solid rgba(236, 72, 153, 0.3)',
              }}
              onClick={onStop}
              title="Stop generating (Esc)"
            >
              <Box
                component="span"
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: { xs: 18, md: 20 },
                  height: { xs: 18, md: 20 },
                  animation: 'pulseStop 1.5s ease-in-out infinite',
                  '@keyframes pulseStop': {
                    '0%': { opacity: 1, transform: 'scale(1)' },
                    '50%': { opacity: 0.5, transform: 'scale(0.85)' },
                    '100%': { opacity: 1, transform: 'scale(1)' },
                  },
                }}
              >
                <Box
                  component="span"
                  sx={{
                    width: { xs: 12, md: 14 },
                    height: { xs: 12, md: 14 },
                    borderRadius: '3px',
                    bgcolor: '#ec4899',
                  }}
                />
              </Box>
            </button>
          ) : (
            <button
              disabled={disabled || !message.trim()}
              className="p-2 md:p-3 rounded-lg bg-pink-500 hover:bg-pink-600 disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors shadow-lg"
              onClick={onSend}
            >
              <ArrowUpwardIcon sx={{ color: '#fff', fontSize: { xs: 18, md: 20 } }} />
            </button>
          )}
        </Box>
      </Box>
    </Box>
  );
}
