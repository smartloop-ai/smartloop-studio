import { useRef, useEffect, useState } from 'react';
import { Box, InputBase, InputAdornment } from '@mui/material';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CloseIcon from '@mui/icons-material/Close';
import AttachFileIcon from '@mui/icons-material/AttachFile';
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
  const [isAttaching, setIsAttaching] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [droppedFile, setDroppedFile] = useState<{ file: File; id: number } | null>(null);
  const dragCounterRef = useRef(0);

  // Refocus input when response generation completes
  const wasLoadingRef = useRef(false);
  useEffect(() => {
    if (wasLoadingRef.current && !isLoading && !disabled) {
      inputRef.current?.focus();
    }
    wasLoadingRef.current = isLoading;
  }, [isLoading, disabled]);

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
      if (!disabled && !isLoading && !isAttaching && message.trim()) {
        onSend();
      }
    }
    if (onKeyDown) {
      onKeyDown(e);
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    if (!allowAttachments) return;
    e.preventDefault();
    dragCounterRef.current += 1;
    if (e.dataTransfer.types.includes('Files')) setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!allowAttachments) return;
    e.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) setIsDraggingOver(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!allowAttachments) return;
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!allowAttachments) return;
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDraggingOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) setDroppedFile({ file, id: Date.now() });
  };

  return (
    <Box
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <Box
        className="px-4 md:px-6 py-3 md:py-4 rounded-lg shadow-lg transition-all relative"
        sx={{
          bgcolor: 'var(--sl-white-alpha-5)',
          border: isDraggingOver
            ? '1px solid var(--sl-brand-primary)'
            : '1px solid var(--sl-border-subtle)',
          '&:focus-within': {
            border: isDraggingOver
              ? '1px solid var(--sl-brand-primary)'
              : '1px solid var(--sl-border-hover)',
          },
        }}
      >
        {isDraggingOver && (
          <Box
            className="absolute inset-0 flex flex-col items-center justify-center rounded-lg z-10 pointer-events-none gap-1"
            sx={{
              bgcolor: 'var(--sl-brand-alpha-10)',
              border: '2px dashed var(--sl-brand-alpha-40)',
              borderRadius: '8px',
            }}
          >
            <AttachFileIcon sx={{ fontSize: 28, color: 'var(--sl-brand-primary)' }} />
            <span className="text-xs" style={{ color: 'var(--sl-brand-primary)' }}>Drop file to attach</span>
          </Box>
        )}
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
                <AutoAwesomeIcon sx={{ color: 'var(--sl-brand-primary)', fontSize: 18, mr: 0.5 }} />
              </InputAdornment>
            ) : null
          }
          sx={{
            border: 'none',
            height: '100%',
            fontSize: '15px',
            lineHeight: '1.5',
            '& .MuiInputBase-input': {
              caretColor: 'var(--sl-brand-primary)',
            },
            '& .MuiInputBase-input.Mui-disabled': {
              color: 'var(--sl-text-muted) !important',
              WebkitTextFillColor: 'var(--sl-text-muted) !important',
            },
            '& .MuiInputBase-input::placeholder': {
              color: 'var(--sl-text-faint)',
              opacity: 1
            },
            '& .MuiInputBase-input.Mui-disabled::placeholder': {
              color: 'var(--sl-text-muted) !important',
              opacity: '1 !important',
              WebkitTextFillColor: 'var(--sl-text-muted) !important',
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
                  console.error('File attach error:', error);
                }}
                onUploadingChange={setIsAttaching}
                disabled={disabled || isLoading}
                size="small"
                showDragDrop={showDragDrop}
                clearTrigger={clearAttachmentTrigger}
                externalDrop={droppedFile}
              />
            )}
            {/* Selected quote indicator */}
            {selectedQuote && (
              <Box
                className="flex items-center gap-1.5 px-2 py-1 text-xs text-sl-text-tertiary border border-sl-border-subtle max-w-[200px] md:max-w-[300px]"
                style={{ backgroundColor: 'var(--sl-white-alpha-7)' }}
                sx={{ flexShrink: 0 }}
              >
                <FormatQuoteIcon sx={{ fontSize: 14, color: 'var(--sl-brand-primary)', flexShrink: 0 }} />
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
                  className="p-0.5 hover:bg-sl-bg-surface-3 rounded transition-colors flex-shrink-0"
                  title="Remove quote"
                >
                  <CloseIcon sx={{ fontSize: 12, color: 'var(--sl-text-muted)' }} />
                </button>
              </Box>
            )}
          </Box>

          {/* Right side - Send / Stop button */}
          {isLoading ? (
            <button
              className="p-2 md:p-3 rounded-lg transition-colors shadow-lg"
              style={{
                backgroundColor: 'var(--sl-brand-alpha-15)',
                border: '1.5px solid var(--sl-brand-alpha-30)',
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
                    bgcolor: 'var(--sl-brand-primary)',
                  }}
                />
              </Box>
            </button>
          ) : (
            <button
              disabled={disabled || isAttaching || !message.trim()}
              className="p-2 md:p-3 rounded-lg disabled:cursor-not-allowed transition-all shadow-lg"
              style={{
                backgroundColor: disabled || isAttaching || !message.trim() ? 'var(--sl-white-alpha-7)' : 'var(--sl-brand-alpha-10)',
                border: `1.5px solid ${disabled || isAttaching || !message.trim() ? 'var(--sl-border-default)' : 'var(--sl-brand-alpha-20)'}`,
              }}
              onMouseEnter={(e) => {
                if (!disabled && !isAttaching && message.trim()) {
                  e.currentTarget.style.backgroundColor = 'var(--sl-brand-alpha-20)';
                  e.currentTarget.style.borderColor = 'var(--sl-brand-alpha-40)';
                }
              }}
              onMouseLeave={(e) => {
                if (!disabled && !isAttaching && message.trim()) {
                  e.currentTarget.style.backgroundColor = 'var(--sl-brand-alpha-10)';
                  e.currentTarget.style.borderColor = 'var(--sl-brand-alpha-20)';
                }
              }}
              onClick={onSend}
            >
              <ArrowUpwardIcon sx={{ color: disabled || isAttaching || !message.trim() ? 'var(--sl-text-disabled)' : 'var(--sl-brand-primary)', fontSize: { xs: 18, md: 20 } }} />
            </button>
          )}
        </Box>
      </Box>
    </Box>
  );
}
