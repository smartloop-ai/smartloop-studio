import { Box } from '@mui/material';
import { marked } from 'marked';

interface DocumentViewerProps {
  document: any;
}

export default function DocumentViewer({ document }: DocumentViewerProps) {
  const content = document?.markdown || document?.summary || '';
  const filename = (document?.path || document?.source)
    ? ((document.path || document.source).split('/').pop() || 'Untitled Document')
    : (document?.filename || document?.name || 'Untitled Document');

  if (!content) {
    return (
      <Box className="flex flex-col items-center justify-center h-full text-center px-4">
        <Box className="text-gray-400 text-sm mb-1">No content available</Box>
        <Box className="text-gray-500 text-xs">
          This document is still being processed
        </Box>
      </Box>
    );
  }

  return (
    <Box className="h-full overflow-y-auto p-6">
      <Box className="max-w-3xl mx-auto">
        <Box className="text-[11px] text-gray-500 mb-6 uppercase tracking-wider">{filename}</Box>
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
