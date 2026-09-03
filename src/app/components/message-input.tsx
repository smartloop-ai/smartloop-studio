import { useRef, useEffect, useState } from 'react';
import { Box, InputBase, IconButton, Tooltip } from '@mui/material';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import MicNoneOutlinedIcon from '@mui/icons-material/MicNoneOutlined';
import FileAttacher from './file-attacher';
import { useThemeContext } from '@/app/contexts/ThemeContext';

export interface SkillOption {
  name: string;
  description?: string;
}

// Skill glyph for the "/" picker — the active theme's own skill icon (e.g. the
// Catppuccin cat) when it ships one, otherwise the default shield. Inherits color.
function SkillGlyph({ svg, size = 13 }: { svg?: string; size?: number }) {
  if (svg) {
    // Force the injected (fixed-size) theme SVG to fill the requested box.
    return (
      <span
        className="flex-shrink-0 inline-flex items-center justify-center [&>svg]:w-full [&>svg]:h-full"
        style={{ width: size, height: size }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
      <path d="M8 1.8l5 1.8v4.5c0 3.1-2.1 5.3-5 6.3-2.9-1-5-3.2-5-6.3V3.6l5-1.8z" stroke="currentColor" strokeWidth="0.75" fill="none" strokeLinejoin="round" />
      <path d="M8.9 4.2L5.8 8.7h2.1l-.8 3.1 3.1-4.6H8.1l.8-3z" fill="currentColor" stroke="currentColor" strokeWidth="0.4" strokeLinejoin="round" />
    </svg>
  );
}

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
  // Bump to pull focus into the prompt. Used when something outside the
  // composer fills it in — an example prompt — so the caret lands after the
  // inserted text and Enter sends without a second click.
  focusTrigger?: number;
  showDragDrop?: boolean;
  minRows?: number;
  maxRows?: number;
  leftSlot?: React.ReactNode;
  // Rendered immediately before the send button. The model switcher lives here
  // rather than on the left so attach keeps the leading position it has always
  // had, and the two controls that decide *how the turn is answered* — which
  // model, and send — sit together.
  rightSlot?: React.ReactNode;
  skills?: SkillOption[];
  onCreateSkill?: (name: string) => void;
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
  focusTrigger = 0,
  showDragDrop = false,
  minRows = 1,
  maxRows = 4,
  leftSlot,
  rightSlot,
  skills = [],
  onCreateSkill,
}: MessageInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isAttaching, setIsAttaching] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [droppedFile, setDroppedFile] = useState<{ file: File; id: number } | null>(null);
  const dragCounterRef = useRef(0);
  const { theme } = useThemeContext();
  const themedSkillSvg = theme.icons?.skills;

  // Leading "/<slug>" command token, if the message opens with one. Highlighted
  // in the input via a mirrored backdrop layer and parsed as a skill server-side.
  // The "/" command is available when there are skills to run OR skills can be
  // created (chat only passes onCreateSkill when a skills-capable model is on).
  const skillsAvailable = skills.length > 0 || !!onCreateSkill;
  const slashToken = skillsAvailable ? (/^\/[A-Za-z0-9][\w-]*/.exec(message)?.[0] ?? null) : null;

  // "/" command — a slash-prefixed word (no spaces yet) opens a picker. It lists
  // matching existing skills to use, plus a "create" action when the typed name
  // is a valid new slug that no existing skill matches.
  const slashMatch = /^\/(\S*)$/.exec(message);
  const rawQuery = slashMatch?.[1] ?? '';
  const skillQuery = rawQuery.toLowerCase();
  const filteredSkills = slashMatch
    ? skills.filter((s) => s.name.toLowerCase().includes(skillQuery))
    : [];
  const normSlug = (s: string) => s.replace(/[\s_-]+/g, '').toLowerCase();
  const exactExists = skills.some((s) => normSlug(s.name) === normSlug(rawQuery));
  const canCreateSkill =
    !!slashMatch && !!onCreateSkill && /^[A-Za-z0-9][\w-]*$/.test(rawQuery) && !exactExists;

  // Unified, keyboard-navigable item list: existing skills to use, then create.
  type PickerItem =
    | { kind: 'use'; skill: SkillOption }
    | { kind: 'create'; name: string };
  const pickerItems: PickerItem[] = [
    ...filteredSkills.map((skill) => ({ kind: 'use' as const, skill })),
    ...(canCreateSkill ? [{ kind: 'create' as const, name: rawQuery }] : []),
  ];
  const showSkillMenu = !!slashMatch && pickerItems.length > 0;
  const [skillIndex, setSkillIndex] = useState(0);

  // Keep the highlighted item in range as the filter narrows.
  useEffect(() => {
    setSkillIndex(0);
  }, [skillQuery, showSkillMenu]);

  // Insert the skill as a leading "/<slug> " token in the message; the user then
  // types the rest of the request after it. The SLP server parses this leading
  // slash-command to resolve the skill (spaces in a name become hyphens so the
  // token stays a single word the server's regex matches).
  const chooseSkill = (skill: SkillOption) => {
    const slug = skill.name.trim().replace(/\s+/g, '-');
    onMessageChange(`/${slug} `);
    inputRef.current?.focus();
  };

  const choosePickerItem = (item: PickerItem) => {
    if (item.kind === 'use') {
      chooseSkill(item.skill);
    } else {
      onCreateSkill?.(item.name);   // creates from template + opens the editor
      onMessageChange('');
    }
  };

  // Elapsed seconds while the model works — shown as a Claude-style "Thinking… 5s"
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!isLoading) { setElapsed(0); return; }
    setElapsed(0);
    const start = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(t);
  }, [isLoading]);

  // Each trigger value is honoured once. A disabled composer can't take focus,
  // so the request is left pending and `disabled` in the deps retries it the
  // moment the input enables — a project created while SLP is still warming
  // still ends up focused.
  const handledFocusRef = useRef(0);
  useEffect(() => {
    if (!focusTrigger || focusTrigger === handledFocusRef.current) return;
    const el = inputRef.current;
    if (!el || disabled) return;
    handledFocusRef.current = focusTrigger;
    el.focus();
    // Caret to the end, not wherever it last sat: the text arrived from
    // outside, and the user's next keystroke should continue it.
    const end = el.value?.length ?? 0;
    el.setSelectionRange?.(end, end);
  }, [focusTrigger, disabled]);

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
    // Skill picker navigation takes precedence over send/newline handling.
    if (showSkillMenu) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSkillIndex((i) => (i + 1) % pickerItems.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSkillIndex((i) => (i - 1 + pickerItems.length) % pickerItems.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        choosePickerItem(pickerItems[skillIndex] ?? pickerItems[0]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        onMessageChange('');
        return;
      }
    }

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
        {/* "/" skill picker — an inline, minimal list above the input */}
        {showSkillMenu && (
          <Box
            className="mb-2 pb-2 flex flex-col gap-0.5"
            sx={{ maxHeight: 180, overflowY: 'auto', borderBottom: '1px solid var(--sl-border-subtle)' }}
          >
            {pickerItems.map((item, i) => (
              <Box
                key={item.kind === 'use' ? `use-${item.skill.name}` : `create-${item.name}`}
                onMouseDown={(e) => { e.preventDefault(); choosePickerItem(item); }}
                onMouseEnter={() => setSkillIndex(i)}
                className="px-2 py-1 rounded cursor-pointer text-[13px] flex items-center gap-2"
                sx={{
                  bgcolor: i === skillIndex ? 'var(--sl-brand-alpha-10)' : 'transparent',
                  color: i === skillIndex ? 'var(--sl-text-primary)' : 'var(--sl-text-muted)',
                }}
              >
                {/* Fixed-width icon slot so every label lines up at the same x */}
                <span className="flex items-center justify-center flex-shrink-0" style={{ width: 16, height: 16, color: 'var(--sl-brand-primary)' }}>
                  {item.kind === 'use' ? (
                    <SkillGlyph svg={themedSkillSvg} size={13} />
                  ) : (
                    <span className="text-[16px] leading-none">+</span>
                  )}
                </span>
                <span className="truncate min-w-0">
                  {item.kind === 'use' ? (
                    item.skill.name
                  ) : (
                    <>Create skill <span style={{ color: 'var(--sl-brand-primary)' }}>“{item.name}”</span></>
                  )}
                </span>
              </Box>
            ))}
          </Box>
        )}
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
        <Box className="relative mb-3">
          {/* Mirror layer that renders the same text with the leading "/command"
              token wrapped in a brand-tinted pill. Text is transparent so the real
              (readable) input text sits on top; only the highlight shows through.
              Metrics must match the textarea exactly so the pill lines up. */}
          {slashToken && (
            <div
              aria-hidden
              className="absolute inset-0 pointer-events-none overflow-hidden"
              style={{
                font: 'inherit',
                fontSize: '15px',
                lineHeight: '1.5',
                padding: 0,
                margin: 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                color: 'transparent',
                zIndex: 0,
              }}
            >
              <span
                style={{
                  backgroundColor: 'var(--sl-brand-alpha-15)',
                  color: 'transparent',
                  borderRadius: '4px',
                  padding: '1px 3px',
                  margin: '0 -3px',
                  boxDecorationBreak: 'clone',
                  WebkitBoxDecorationBreak: 'clone',
                }}
              >
                {slashToken}
              </span>
              {message.slice(slashToken.length)}
            </div>
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
          className="w-full text-inherit"
          onKeyDown={handleKeyDownInternal}
          sx={{
            border: 'none',
            height: '100%',
            fontSize: '15px',
            lineHeight: '1.5',
            padding: 0,
            position: 'relative',
            zIndex: 1,
            '& .MuiInputBase-input': {
              padding: 0,
              background: 'transparent',
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
        </Box>

        <Box className="flex items-center justify-between gap-2">
          {/* Left side - file attachment and selected quote */}
          <Box className="flex items-center gap-2 flex-1 min-w-0 overflow-hidden">
            {leftSlot}
            {allowAttachments && (
              /* Single Attach action — documents plus images when a vision model is available */
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
            )}
          </Box>

          {/* Right side - model switcher, dictation, then Send / Stop. Voice sits
              immediately left of Send the way ChatGPT, Gemini and Copilot place
              it: the two things you reach for to *submit* a turn stay together,
              and the far left is left to Attach alone. */}
          <Box className="flex items-center gap-2 flex-shrink-0">
            {rightSlot}

            {/* Voice input — disabled until speech-to-text is available */}
            <Tooltip title={allowVoice ? 'Voice input' : 'Voice input coming soon'} placement="top" arrow>
              <span className="flex items-center">
                <IconButton
                  disabled={!allowVoice || disabled || isLoading}
                  size="small"
                  sx={{
                    color: 'var(--sl-text-muted)',
                    // The same 28px outlined box as Attach, the model pill and
                    // Send — stated outright rather than left to padding and
                    // glyph size. Bare, it read as a gap between two bordered
                    // controls rather than as a quieter one.
                    borderRadius: '6px',
                    width: '28px',
                    height: '28px',
                    padding: 0,
                    boxSizing: 'border-box',
                    border: '1px solid var(--sl-border-default)',
                    backgroundColor: 'var(--sl-white-alpha-7)',
                    '&:hover': {
                      color: 'var(--sl-brand-primary)',
                      borderColor: 'var(--sl-border-hover)',
                      backgroundColor: 'var(--sl-white-alpha-10)',
                    },
                    '&.Mui-disabled': {
                      color: 'var(--sl-text-disabled)',
                      border: '1px solid var(--sl-border-default)',
                      opacity: 0.5,
                    },
                  }}
                >
                  <MicNoneOutlinedIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </span>
            </Tooltip>

            {isLoading ? (
            <button
              className="flex items-center justify-center rounded-md transition-colors flex-shrink-0"
              style={{
                width: '28px',
                height: '28px',
                boxSizing: 'border-box',
                backgroundColor: 'var(--sl-brand-alpha-15)',
                border: '1px solid var(--sl-brand-alpha-30)',
              }}
              onClick={onStop}
              title="Stop generating (Esc)"
            >
              <Box
                component="span"
                sx={{
                  width: 10,
                  height: 10,
                  borderRadius: '2px',
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
              className="flex items-center justify-center rounded-md disabled:cursor-not-allowed transition-all flex-shrink-0"
              style={{
                width: '28px',
                height: '28px',
                boxSizing: 'border-box',
                backgroundColor: disabled || isAttaching || !message.trim() ? 'var(--sl-white-alpha-7)' : 'var(--sl-brand-alpha-10)',
                border: `1px solid ${disabled || isAttaching || !message.trim() ? 'var(--sl-border-default)' : 'var(--sl-brand-alpha-20)'}`,
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
              <ArrowUpwardIcon sx={{ color: disabled || isAttaching || !message.trim() ? 'var(--sl-text-disabled)' : 'var(--sl-brand-primary)', fontSize: 16 }} />
            </button>
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
