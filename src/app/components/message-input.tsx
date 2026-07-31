import { useRef, useEffect, useState } from 'react';
import { Box, InputBase, IconButton, Tooltip } from '@mui/material';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import MicNoneOutlinedIcon from '@mui/icons-material/MicNoneOutlined';
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
  allowImages?: boolean;
  allowVoice?: boolean;
  conversation?: any;
  onFileAttached?: (documentId: string, fileName: string) => void;
  onAttachmentClear?: () => void;
  clearAttachmentTrigger?: number;
  showDragDrop?: boolean;
  minRows?: number;
  maxRows?: number;
  leftSlot?: React.ReactNode;
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
  allowImages = false,
  allowVoice = false,
  conversation = null,
  onFileAttached,
  onAttachmentClear,
  clearAttachmentTrigger = 0,
  showDragDrop = false,
  minRows = 1,
  maxRows = 4,
  leftSlot,
}: MessageInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isAttaching, setIsAttaching] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [droppedFile, setDroppedFile] = useState<{ file: File; id: number } | null>(null);
  const dragCounterRef = useRef(0);

  // Elapsed seconds while the model works — shown as a Claude-style "Thinking… 5s"
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!isLoading) { setElapsed(0); return; }
    setElapsed(0);
    const start = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(t);
  }, [isLoading]);

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
        className="px-3 md:px-5 py-3 md:py-4 rounded-lg transition-all relative"
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
          placeholder={isLoading ? `Thinking… (${elapsed}s)` : placeholder}
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
              color: 'var(--sl-text-faint) !important',
              opacity: '1 !important',
              WebkitTextFillColor: 'var(--sl-text-faint) !important',
            },
          }}
        />

        <Box className="flex items-center justify-between">
          {/* Left side - Model selector, file attachment and selected quote */}
          <Box className="flex items-center gap-2 flex-1 overflow-hidden">
            {leftSlot}
            {allowAttachments && (
              <>
                {/* Single Attach action — documents plus images when a vision model is available */}
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
                  allowImages={allowImages}
                  showDragDrop={showDragDrop}
                  clearTrigger={clearAttachmentTrigger}
                  externalDrop={droppedFile}
                />

                {/* Voice input — disabled until speech-to-text is available */}
                <Tooltip title={allowVoice ? 'Voice input' : 'Voice input coming soon'} placement="top" arrow>
                  <span>
                    <IconButton
                      disabled={!allowVoice || disabled || isLoading}
                      size="small"
                      sx={{
                        color: 'var(--sl-text-muted)',
                        borderRadius: '8px',
                        padding: '5px',
                        '&:hover': { color: 'var(--sl-brand-primary)', backgroundColor: 'var(--sl-white-alpha-7)' },
                        '&.Mui-disabled': { color: 'var(--sl-text-disabled)', opacity: 0.5 },
                      }}
                    >
                      <MicNoneOutlinedIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                  </span>
                </Tooltip>
              </>
            )}
          </Box>

          {/* Right side - Send / Stop button */}
          {isLoading ? (
            <button
              className="w-9 h-9 flex items-center justify-center rounded-lg transition-colors"
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
                  width: 12,
                  height: 12,
                  borderRadius: '3px',
                  bgcolor: 'var(--sl-brand-primary)',
                  animation: 'pulseStop 1.5s ease-in-out infinite',
                  '@keyframes pulseStop': {
                    '0%': { opacity: 1, transform: 'scale(1)' },
                    '50%': { opacity: 0.5, transform: 'scale(0.85)' },
                    '100%': { opacity: 1, transform: 'scale(1)' },
                  },
                }}
              />
            </button>
          ) : (
            <button
              disabled={disabled || isAttaching || !message.trim()}
              className="w-9 h-9 flex items-center justify-center rounded-lg disabled:cursor-not-allowed transition-all"
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
              <ArrowUpwardIcon sx={{ color: disabled || isAttaching || !message.trim() ? 'var(--sl-text-disabled)' : 'var(--sl-brand-primary)', fontSize: 18 }} />
            </button>
          )}
        </Box>
      </Box>
    </Box>
  );
}
