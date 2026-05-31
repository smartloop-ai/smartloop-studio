import { SxProps, Theme } from '@mui/material';

/**
 * Markdown styles for the document viewer.
 * Uses the app's centralized --sl-* CSS custom properties from theme.css
 * so the viewer automatically follows the app theme.
 */
export function getMarkdownStyles(): SxProps<Theme> {
  return {
    color: 'var(--sl-text-secondary)',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif',
    fontSize: '16px',
    lineHeight: 1.7,
    wordWrap: 'break-word',

    '& h1': {
      color: 'var(--sl-text-primary)',
      fontWeight: 600,
      fontSize: '2em',
      mt: 3,
      mb: 2,
      pb: 1,
      lineHeight: 1.25,
      borderBottom: '1px solid var(--sl-border-default)',
    },
    '& h2': {
      color: 'var(--sl-text-primary)',
      fontWeight: 600,
      fontSize: '1.5em',
      mt: 3,
      mb: 2,
      pb: 0.75,
      lineHeight: 1.25,
      borderBottom: '1px solid var(--sl-border-default)',
    },
    '& h3': {
      color: 'var(--sl-text-secondary)',
      fontWeight: 600,
      fontSize: '1.25em',
      mt: 3,
      mb: 2,
      lineHeight: 1.25,
    },
    '& h4, & h5, & h6': {
      color: 'var(--sl-text-tertiary)',
      fontWeight: 600,
      mt: 3,
      mb: 2,
    },

    '& p': { color: 'var(--sl-text-secondary)', mb: 2 },
    '& a': {
      color: 'var(--sl-status-info)',
      textDecoration: 'none',
      '&:hover': { textDecoration: 'underline', color: 'var(--sl-brand-light)' },
    },

    '& code': {
      fontFamily:
        '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
      bgcolor: 'var(--sl-bg-inline-code)',
      color: 'var(--sl-status-warning)',
      padding: '0.2em 0.4em',
      borderRadius: '6px',
      fontSize: '85%',
    },
    '& pre': {
      fontFamily:
        '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
      bgcolor: 'var(--sl-bg-surface-1)',
      border: '1px solid var(--sl-border-code)',
      padding: '16px',
      borderRadius: '6px',
      overflow: 'auto',
      mb: 2,
      fontSize: '85%',
      lineHeight: 1.45,
      '& code': {
        bgcolor: 'transparent',
        color: 'var(--sl-text-secondary)',
        padding: 0,
        borderRadius: 0,
        fontSize: '100%',
      },
    },

    '& blockquote': {
      bgcolor: 'var(--sl-bg-surface-2)',
      border: '1px solid var(--sl-border-default)',
      borderLeftWidth: '4px',
      borderLeftStyle: 'solid',
      borderLeftColor: 'var(--sl-brand-primary)',
      borderRadius: '0 6px 6px 0',
      pl: 2,
      pr: 2,
      py: 1.5,
      ml: 0,
      mb: 2,
      color: 'var(--sl-text-muted)',
      fontStyle: 'italic',
      boxShadow: '0 1px 2px var(--sl-black-alpha-20)',
    },

    '& ul, & ol': { color: 'var(--sl-text-secondary)', pl: 3, mb: 2 },
    '& li': { mb: 0.5, '&::marker': { color: 'var(--sl-text-muted)' } },
    '& li + li': { mt: 0.5 },

    '& table': {
      width: '100%',
      borderCollapse: 'collapse',
      mb: 2,
      display: 'block',
      overflow: 'auto',
    },
    '& th': {
      border: '1px solid var(--sl-border-code)',
      padding: '6px 13px',
      bgcolor: 'var(--sl-bg-table-head)',
      color: 'var(--sl-text-primary)',
      fontWeight: 600,
      textAlign: 'left',
    },
    '& td': {
      border: '1px solid var(--sl-border-code)',
      padding: '6px 13px',
      color: 'var(--sl-text-secondary)',
    },
    '& tr:nth-of-type(even) td': {
      bgcolor: 'var(--sl-bg-table-stripe)',
    },

    '& hr': {
      border: 'none',
      height: '1px',
      bgcolor: 'var(--sl-border-default)',
      my: 3,
    },

    '& img': { maxWidth: '100%', borderRadius: '6px', my: 2 },

    '& strong': { color: 'var(--sl-text-primary)', fontWeight: 600 },
    '& em': { fontStyle: 'italic', color: 'var(--sl-text-tertiary)' },
  };
}
