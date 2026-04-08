import { Box } from '@mui/material';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import { marked } from 'marked';
import { useState, useEffect, useCallback, useRef } from 'react';

interface DocumentViewerProps {
  document: any;
  projectId?: string;
  onStartConversation?: (selectedText: string, documentName: string) => void;
}

export default function DocumentViewer({ document, projectId, onStartConversation }: DocumentViewerProps) {
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [selectionPopup, setSelectionPopup] = useState<{ text: string; x: number; y: number } | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const filename = (document?.path || document?.source)
    ? ((document.path || document.source).split('/').pop() || 'Untitled Document')
    : (document?.filename || document?.name || 'Untitled Document');

  const baseName = filename.replace(/\.[^/.]+$/, '');
  const extension = filename.includes('.') ? filename.split('.').pop()?.toUpperCase() || '' : '';

  // Try to read the .md file from the project's sources directory
  useEffect(() => {
    setFileContent(null);

    const readFromDisk = async () => {
      if (!window.electronAPI?.readTextFile) return;

      // Try multiple possible paths for the markdown file
      const candidates: string[] = [];

      const source = document?.path || document?.source || '';
      const sourceFile = source.split('/').pop() || '';
      const sourceBase = sourceFile.replace(/\.[^/.]+$/, '');

      // Primary: read from ~/.smartloop/{projectId}/sources/{name}.md
      if (projectId) {
        candidates.push(`~/.smartloop/${projectId}/sources/${baseName}.md`);
        if (sourceBase && sourceBase !== baseName) {
          candidates.push(`~/.smartloop/${projectId}/sources/${sourceBase}.md`);
        }
      }

      // Fallback: if source is already an .md path, try it directly
      if (source.endsWith('.md')) {
        candidates.push(source);
      }

      for (const path of candidates) {
        if (!path) continue;
        const result = await window.electronAPI.readTextFile(path);
        if (result.success && result.content) {
          setFileContent(result.content);
          return;
        }
      }
    };

    readFromDisk();
  }, [document?.id, projectId, baseName]);

  // Handle text selection to show popup
  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      setSelectionPopup(null);
      return;
    }

    const text = selection.toString().trim();
    if (text.length < 3) {
      setSelectionPopup(null);
      return;
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const containerRect = contentRef.current?.getBoundingClientRect();

    if (containerRect) {
      setSelectionPopup({
        text,
        x: rect.left + rect.width / 2 - containerRect.left,
        y: rect.top - containerRect.top - 8,
      });
    }
  }, []);

  // Dismiss popup when clicking outside
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.selection-popup')) {
        setSelectionPopup(null);
      }
    };
    window.addEventListener('mousedown', handleMouseDown);
    return () => window.removeEventListener('mousedown', handleMouseDown);
  }, []);

  const handleAskAboutSelection = () => {
    if (selectionPopup && onStartConversation) {
      onStartConversation(selectionPopup.text, filename);
      setSelectionPopup(null);
      window.getSelection()?.removeAllRanges();
    }
  };

  // Prefer file from disk, then markdown field; skip summary (it's just an excerpt)
  const content = fileContent || document?.markdown || '';

  if (!content) {
    return (
      <Box className="flex flex-col items-center justify-center h-full text-center px-4">
        <Box className="text-gray-400 text-sm mb-1">No content available</Box>
        <Box className="text-gray-500 text-xs">
          This document may still be processing
        </Box>
      </Box>
    );
  }

  return (
    <Box
      className="h-full overflow-y-auto"
      sx={{
        borderLeft: '1px solid',
        borderColor: 'var(--sl-white-alpha-10)',
      }}
    >
      {/* Document header bar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          px: 5,
          py: 1.5,
          borderBottom: '1px solid var(--sl-white-alpha-8)',
          bgcolor: 'rgba(255,255,255,0.02)',
        }}
      >
        <DescriptionOutlinedIcon sx={{ fontSize: 16, color: 'var(--sl-text-muted)' }} />
        <Box sx={{ fontSize: '12px', color: 'var(--sl-text-secondary)', fontWeight: 500 }}>{filename}</Box>
        {extension && (
          <Box
            sx={{
              fontSize: '10px',
              color: 'var(--sl-text-muted)',
              bgcolor: 'var(--sl-white-alpha-8)',
              px: 1,
              py: 0.25,
              borderRadius: '3px',
              fontWeight: 600,
              letterSpacing: '0.5px',
            }}
          >
            {extension}
          </Box>
        )}
      </Box>
      <Box ref={contentRef} className="max-w-3xl mx-auto px-10 py-8" sx={{ position: 'relative' }} onMouseUp={handleMouseUp}>
        {/* Selection popup */}
        {selectionPopup && onStartConversation && (
          <Box
            className="selection-popup"
            onMouseDown={(e) => e.stopPropagation()}
            sx={{
              position: 'absolute',
              left: selectionPopup.x,
              top: selectionPopup.y,
              transform: 'translate(-50%, -100%)',
              zIndex: 100,
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              px: 1.5,
              py: 0.75,
              bgcolor: 'var(--sl-brand-primary)',
              color: 'white',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
              whiteSpace: 'nowrap',
              userSelect: 'none',
              '&:hover': {
                filter: 'brightness(1.1)',
              },
              // Arrow pointing down
              '&::after': {
                content: '""',
                position: 'absolute',
                bottom: '-5px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: 0,
                height: 0,
                borderLeft: '5px solid transparent',
                borderRight: '5px solid transparent',
                borderTop: '5px solid var(--sl-brand-primary)',
              },
            }}
            onClick={handleAskAboutSelection}
          >
            <ChatBubbleOutlineIcon sx={{ fontSize: 13 }} />
            Ask about this
          </Box>
        )}
        <Box
          className="document-markdown-viewer"
          sx={{
            color: 'var(--sl-text-primary)',
            fontSize: '14px',
            lineHeight: 1.8,

            '& h1': { color: 'white', fontWeight: 700, fontSize: '1.75em', mt: 4, mb: 2, pb: 1, borderBottom: '1px solid var(--sl-white-alpha-10)' },
            '& h2': { color: 'white', fontWeight: 600, fontSize: '1.4em', mt: 3, mb: 1.5 },
            '& h3': { color: 'white', fontWeight: 600, fontSize: '1.15em', mt: 2.5, mb: 1 },
            '& h4, & h5, & h6': { color: 'var(--sl-text-secondary)', fontWeight: 600, mt: 2, mb: 1 },

            '& p': { color: 'var(--sl-text-secondary)', mb: 2 },
            '& a': { color: 'var(--sl-brand-primary)', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } },

            '& code': {
              bgcolor: 'var(--sl-white-alpha-8)',
              color: 'var(--sl-text-primary)',
              padding: '2px 6px',
              borderRadius: '4px',
              fontSize: '0.85em',
              fontFamily: 'monospace',
            },
            '& pre': {
              bgcolor: 'var(--sl-white-alpha-5)',
              border: '1px solid var(--sl-white-alpha-8)',
              padding: '16px',
              borderRadius: '8px',
              overflow: 'auto',
              mb: 2,
              '& code': { bgcolor: 'transparent', padding: 0, borderRadius: 0 },
            },

            '& blockquote': {
              borderLeft: '3px solid var(--sl-brand-alpha-30)',
              pl: 2,
              ml: 0,
              color: 'var(--sl-text-muted)',
              fontStyle: 'italic',
              mb: 2,
            },

            '& ul, & ol': { color: 'var(--sl-text-secondary)', pl: 3, mb: 2 },
            '& li': { mb: 0.5 },

            '& table': { width: '100%', borderCollapse: 'collapse', mb: 2 },
            '& th': { border: '1px solid var(--sl-white-alpha-15)', padding: '10px 12px', bgcolor: 'var(--sl-white-alpha-5)', color: 'white', fontWeight: 600, textAlign: 'left', fontSize: '0.85em' },
            '& td': { border: '1px solid var(--sl-white-alpha-10)', padding: '8px 12px', fontSize: '0.9em' },

            '& hr': { border: 'none', borderTop: '1px solid var(--sl-white-alpha-10)', my: 3 },

            '& img': { maxWidth: '100%', borderRadius: '6px', my: 2 },

            '& strong': { color: 'white', fontWeight: 600 },
            '& em': { fontStyle: 'italic' },
          }}
          dangerouslySetInnerHTML={{
            __html: marked.parse(content, { async: false }) as string,
          }}
        />
      </Box>
    </Box>
  );
}
