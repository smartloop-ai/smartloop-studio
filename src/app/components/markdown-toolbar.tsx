import { Box, Tooltip } from '@mui/material';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import TitleIcon from '@mui/icons-material/Title';
import CodeIcon from '@mui/icons-material/Code';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import FormatQuoteIcon from '@mui/icons-material/FormatQuote';
import LinkIcon from '@mui/icons-material/Link';

/**
 * Markdown formatting toolbar for a plain `<textarea>`.
 *
 * Shared by the skill editor and the project-instructions dialog so both write
 * Markdown the same way. It owns nothing: every button reads the caret /
 * selection off `textareaRef`, then hands the rewritten text back through
 * `onChange` and restores the selection, so the host component stays the single
 * owner of the value.
 */

interface MarkdownToolbarProps {
  // Accepts both RefObject and MutableRefObject shapes.
  textareaRef: { current: HTMLTextAreaElement | null };
  value: string;
  onChange: (next: string) => void;
  /** Container classes — override to match the surrounding editor's padding. */
  className?: string;
  /** Optional right-aligned hint (e.g. "Markdown"). */
  hint?: string;
  /**
   * Color of the rule under the toolbar. The default suits a toolbar sitting on
   * `--sl-bg-base`; on a `--sl-bg-surface-1` surface pass `--sl-border-default`
   * instead, because most themes (and every derived one — see
   * `deriveThemeColors` in theme-parse.ts) set `border.subtle` to exactly
   * `bg.surface1`, which makes the default rule invisible there.
   */
  dividerColor?: string;
}

export default function MarkdownToolbar({
  textareaRef,
  value,
  onChange,
  className = 'px-4 py-1',
  hint,
  dividerColor = 'var(--sl-border-subtle)',
}: MarkdownToolbarProps) {
  // Apply the new value + restore a selection/caret, keeping focus on the input.
  const applyEdit = (next: string, selStart: number, selEnd: number) => {
    onChange(next);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(selStart, selEnd);
    });
  };

  // Wrap the current selection with `marker` on both sides (bold, italic, code).
  const wrapSelection = (marker: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = value.slice(start, end) || 'text';
    const next = value.slice(0, start) + marker + selected + marker + value.slice(end);
    applyEdit(next, start + marker.length, start + marker.length + selected.length);
  };

  // Prefix each selected line with `prefix` (headings, lists, quotes).
  const prefixLines = (prefix: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const block = value.slice(lineStart, end);
    const replaced = block
      .split('\n')
      .map((l) => (l.startsWith(prefix) ? l : prefix + l))
      .join('\n');
    const next = value.slice(0, lineStart) + replaced + value.slice(end);
    applyEdit(next, lineStart, lineStart + replaced.length);
  };

  const insertLink = () => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const label = value.slice(start, end) || 'text';
    const snippet = `[${label}](url)`;
    const next = value.slice(0, start) + snippet + value.slice(end);
    // Select the "url" placeholder for quick replacement.
    const urlStart = start + label.length + 3;
    applyEdit(next, urlStart, urlStart + 3);
  };

  const buttons = [
    { key: 'bold', title: 'Bold', icon: <FormatBoldIcon sx={{ fontSize: 16 }} />, run: () => wrapSelection('**') },
    { key: 'italic', title: 'Italic', icon: <FormatItalicIcon sx={{ fontSize: 16 }} />, run: () => wrapSelection('*') },
    { key: 'heading', title: 'Heading', icon: <TitleIcon sx={{ fontSize: 16 }} />, run: () => prefixLines('# ') },
    { key: 'code', title: 'Code', icon: <CodeIcon sx={{ fontSize: 16 }} />, run: () => wrapSelection('`') },
    { key: 'ul', title: 'Bulleted list', icon: <FormatListBulletedIcon sx={{ fontSize: 16 }} />, run: () => prefixLines('- ') },
    { key: 'quote', title: 'Quote', icon: <FormatQuoteIcon sx={{ fontSize: 16 }} />, run: () => prefixLines('> ') },
    { key: 'link', title: 'Link', icon: <LinkIcon sx={{ fontSize: 16 }} />, run: () => insertLink() },
  ];

  return (
    <Box
      className={`flex items-center gap-0.5 flex-none ${className}`}
      sx={{ borderBottom: `1px solid ${dividerColor}` }}
    >
      {buttons.map((btn) => (
        <Tooltip key={btn.key} title={btn.title} placement="bottom" arrow>
          <button
            type="button"
            // onMouseDown (not onClick) so the textarea keeps its selection —
            // the default would blur it before the handler reads selectionStart.
            onMouseDown={(e) => { e.preventDefault(); btn.run(); }}
            className="flex items-center justify-center rounded transition-colors"
            style={{ width: 28, height: 28, color: 'var(--sl-text-muted)', background: 'transparent', border: 'none', cursor: 'pointer' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--sl-brand-primary)'; e.currentTarget.style.backgroundColor = 'var(--sl-white-alpha-7)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--sl-text-muted)'; e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            {btn.icon}
          </button>
        </Tooltip>
      ))}
      {hint && <span className="ml-auto text-[10px] text-sl-text-faint flex-shrink-0 pr-1">{hint}</span>}
    </Box>
  );
}
