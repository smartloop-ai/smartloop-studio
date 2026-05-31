import { Box, IconButton, Tooltip } from '@mui/material';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import { marked } from 'marked';
import { useState, useEffect, useRef } from 'react';
import { getMarkdownStyles } from './document-viewer-themes';

interface DocumentViewerProps {
  document: any;
  projectId?: string;
  onStartConversation?: (selectedText: string, documentName: string) => void;
}

export default function DocumentViewer({ document, projectId }: DocumentViewerProps) {
  const markdownSx = getMarkdownStyles();
  const [fileContent, setFileContent] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const filename = (document?.path || document?.source)
    ? ((document.path || document.source).split('/').pop() || 'Untitled Document')
    : (document?.filename || document?.name || 'Untitled Document');

  const baseName = filename.replace(/\.[^/.]+$/, '');

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

  // Prefer file from disk, then markdown field; skip summary (it's just an excerpt)
  const content = fileContent || document?.markdown || '';

  const handleDownload = async () => {
    const electronAPI = (window as any).electronAPI;
    if (electronAPI?.saveFileDialog && content) {
      await electronAPI.saveFileDialog(filename, content);
    }
  };

  if (!content) {
    return (
      <Box className="flex flex-col items-center justify-center h-full text-center px-4">
        <Box className="text-sl-text-muted text-sm mb-1">No content available</Box>
        <Box className="text-sl-text-disabled text-xs">
          This document may still be processing
        </Box>
      </Box>
    );
  }

  // Count words for footer
  const wordCount = content.trim().split(/\s+/).filter(Boolean).length;
  const readingTimeMin = Math.max(1, Math.round(wordCount / 200));

  return (
    <Box
      className="h-full overflow-y-auto"
      sx={{
        borderLeft: '1px solid',
        borderColor: 'var(--sl-border-default)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Box
        sx={{
          bgcolor: 'var(--sl-bg-base)',
          flex: 1,
        }}
      >
        <Box
          ref={contentRef}
          sx={{
            px: { xs: 1.5, md: 2 },
            py: { xs: 1, md: 2 },
            position: 'relative',
          }}
        >
          <Box
            sx={{
              bgcolor: 'var(--sl-bg-surface-1)',
              border: '1px solid var(--sl-brand-alpha-30)',
              borderRadius: '8px',
              boxShadow: '0 2px 8px var(--sl-black-alpha-30)',
              overflow: 'hidden',
            }}
          >
            {/* Document info bar */}
            <div className="flex items-center gap-2.5 px-3 md:px-5 py-2.5" style={{ borderBottom: '1px solid var(--sl-brand-alpha-30)', background: 'var(--sl-bg-surface-2)' }}>
              <div className="flex items-center gap-2 text-[11px] text-sl-text-muted">
                <DescriptionOutlinedIcon sx={{ fontSize: 12, color: 'var(--sl-text-muted)' }} />
                <span className="text-sl-text-tertiary font-medium">{filename}</span>
                <span className="text-sl-text-faint">·</span>
                <span>{wordCount.toLocaleString()} words</span>
                <span className="text-sl-text-faint">·</span>
                <span>{readingTimeMin} min read</span>
              </div>
              <div className="ml-auto">
                <Tooltip title="Save" arrow>
                  <IconButton
                    size="small"
                    onClick={handleDownload}
                    sx={{ color: 'var(--sl-text-disabled)', p: 0.5, '&:hover': { color: 'var(--sl-text-muted)' } }}
                  >
                    <SaveOutlinedIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                </Tooltip>
              </div>
            </div>

            {/* Document content */}
            <Box
              className="document-markdown-viewer"
              sx={{
                ...markdownSx,
                px: { xs: 1.5, md: 2.5 },
                py: { xs: 1.5, md: 2.5 },
              }}
              dangerouslySetInnerHTML={{
                __html: marked.parse(content, { async: false }) as string,
              }}
            />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
