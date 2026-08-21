import { Box } from '@mui/material';
import CircleIcon from '@mui/icons-material/Circle';
import { useState, useEffect, useRef } from 'react';
import { useThemeContext } from '@/app/contexts/ThemeContext';
import MarkdownToolbar from './markdown-toolbar';

interface Skill {
  name: string;
  content: string;
  description?: string;
}

interface SkillEditorProps {
  selectedProject: any;
  projectSkills: Skill[];
  skillIndex: number;
  isSavingSkills: boolean;
  onSaveSkills: (skills: Skill[]) => void;
  isNew?: boolean;
}

/** Extract display name from content (frontmatter or first heading). */
const getDisplayName = (raw: string): string => {
  const fmMatch = raw.match(/^---\s*\n([\s\S]*?)\n---/);
  if (fmMatch) {
    const nameMatch = fmMatch[1].match(/^name:\s*(.*)$/m);
    if (nameMatch?.[1]?.trim()) return nameMatch[1].trim();
  }
  const heading = raw.match(/^#\s+(.+)$/m);
  return heading?.[1]?.trim() || 'Untitled Skill';
};

const DEFAULT_SKILL_TEMPLATE = `---
name: My Skill Name
description:
---

[Add your instructions here]
`;

// Shared text metrics — the highlight backdrop and the textarea MUST match
// exactly so the colored frontmatter lines up under the (transparent) input text.
const editorTextStyle: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: '13px',
  lineHeight: 1.7,
  padding: '20px 24px',
  tabSize: 2,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  margin: 0,
  boxSizing: 'border-box',
};

// Inline markdown within a body line: bold, italic, inline code, links. Only
// wraps existing characters in colored spans (markers included), so the text
// stays character-identical to the textarea and alignment is preserved.
function renderInline(text: string): React.ReactNode {
  const regex = /(`[^`]+`)|(\*\*[^*]+\*\*|__[^_]+__)|(\*[^*\s][^*]*\*|_[^_\s][^_]*_)|(\[[^\]]+\]\([^)]*\))/g;
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tok = m[0];
    if (m[1]) nodes.push(<span key={key++} style={{ color: 'var(--sl-brand-light)' }}>{tok}</span>);
    else if (m[2]) nodes.push(<span key={key++} style={{ color: 'var(--sl-text-primary)', fontWeight: 700 }}>{tok}</span>);
    else if (m[3]) nodes.push(<span key={key++} style={{ color: 'var(--sl-text-secondary)', fontStyle: 'italic' }}>{tok}</span>);
    else if (m[4]) nodes.push(<span key={key++} style={{ color: 'var(--sl-brand-primary)', textDecoration: 'underline' }}>{tok}</span>);
    last = regex.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

// A body (non-frontmatter) line: block prefixes (heading / list / quote) plus
// inline formatting.
function renderBodyLine(line: string): React.ReactNode {
  let m: RegExpExecArray | null;
  if ((m = /^(#{1,6}\s)(.*)$/.exec(line))) {
    return (
      <span style={{ color: 'var(--sl-brand-primary)', fontWeight: 700 }}>
        {m[1]}{renderInline(m[2])}
      </span>
    );
  }
  if ((m = /^(\s*>\s?)(.*)$/.exec(line))) {
    return (
      <>
        <span style={{ color: 'var(--sl-text-faint)' }}>{m[1]}</span>
        <span style={{ color: 'var(--sl-text-muted)' }}>{renderInline(m[2])}</span>
      </>
    );
  }
  if ((m = /^(\s*(?:[-*+]|\d+\.)\s)(.*)$/.exec(line))) {
    return (
      <>
        <span style={{ color: 'var(--sl-brand-primary)' }}>{m[1]}</span>
        {renderInline(m[2])}
      </>
    );
  }
  return renderInline(line);
}

/** Colorize the content: leading YAML frontmatter block + body markdown. */
function highlightFrontmatter(content: string): React.ReactNode {
  const lines = content.split('\n');
  let inFrontmatter = false;
  let frontmatterClosed = false;

  return lines.map((line, i) => {
    const isDelim = line.trim() === '---';
    let node: React.ReactNode;

    if (i === 0 && isDelim) {
      inFrontmatter = true;
      node = <span style={{ color: 'var(--sl-text-faint)' }}>{line}</span>;
    } else if (inFrontmatter && !frontmatterClosed && isDelim) {
      frontmatterClosed = true;
      inFrontmatter = false;
      node = <span style={{ color: 'var(--sl-text-faint)' }}>{line}</span>;
    } else if (inFrontmatter && !frontmatterClosed) {
      const m = /^(\s*)([\w-]+)(\s*:)(.*)$/.exec(line);
      node = m ? (
        <>
          {m[1]}
          <span style={{ color: 'var(--sl-brand-primary)' }}>{m[2]}</span>
          <span style={{ color: 'var(--sl-text-faint)' }}>{m[3]}</span>
          <span style={{ color: 'var(--sl-text-muted)' }}>{m[4]}</span>
        </>
      ) : (
        <span style={{ color: 'var(--sl-text-muted)' }}>{line}</span>
      );
    } else {
      node = renderBodyLine(line);
    }

    return (
      <span key={i}>
        {node}
        {i < lines.length - 1 ? '\n' : ''}
      </span>
    );
  });
}

/** The active theme's skill glyph (e.g. the Catppuccin cat), else the shield. */
function SkillGlyph({ svg, size = 16 }: { svg?: string; size?: number }) {
  if (svg) {
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

export default function SkillEditor({
  projectSkills,
  skillIndex,
  onSaveSkills,
  isNew = false,
}: SkillEditorProps) {
  const { theme } = useThemeContext();
  const skill = isNew ? null : projectSkills[skillIndex];
  const [content, setContent] = useState(skill?.content || DEFAULT_SKILL_TEMPLATE);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  // Keep the highlight backdrop scrolled in lockstep with the textarea.
  const syncScroll = () => {
    if (backdropRef.current && textareaRef.current) {
      backdropRef.current.scrollTop = textareaRef.current.scrollTop;
      backdropRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  };

  // Keep latest values in refs so unmount cleanup can flush an unsaved save
  const contentRef = useRef(content);
  const hasUnsavedChangesRef = useRef(hasUnsavedChanges);
  const projectSkillsRef = useRef(projectSkills);
  const skillIndexRef = useRef(skillIndex);
  const isNewRef = useRef(isNew);
  const onSaveSkillsRef = useRef(onSaveSkills);
  useEffect(() => { contentRef.current = content; }, [content]);
  useEffect(() => { hasUnsavedChangesRef.current = hasUnsavedChanges; }, [hasUnsavedChanges]);
  useEffect(() => { projectSkillsRef.current = projectSkills; }, [projectSkills]);
  useEffect(() => { skillIndexRef.current = skillIndex; }, [skillIndex]);
  useEffect(() => { isNewRef.current = isNew; }, [isNew]);
  useEffect(() => { onSaveSkillsRef.current = onSaveSkills; }, [onSaveSkills]);

  // Keyboard shortcut: Ctrl/Cmd+S to save immediately. Matched on e.code so a
  // non-QWERTY layout still triggers on the S key, and Alt/Shift are excluded so
  // the other two S bindings don't also land here — Ctrl+Alt+S toggles web
  // search and Ctrl+Shift+S opens the Skills rail section. Mac is safe either
  // way (Opt+S types 'ß', Shift+S types 'S'), but on Windows/Linux e.key stays
  // 's' under Alt, so without this guard toggling web search with the editor
  // open would fire a save too.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.code === 'KeyS') {
        e.preventDefault();
        if (hasUnsavedChanges && content.trim()) {
          handleSave();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasUnsavedChanges, content, projectSkills, skillIndex, isNew]);

  // Auto-save after 1.5s of inactivity
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!hasUnsavedChanges || !content.trim()) return;

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      handleSave();
    }, 1500);

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [content, hasUnsavedChanges]);

  // Flush unsaved changes on unmount (tab close/switch)
  useEffect(() => {
    return () => {
      if (!hasUnsavedChangesRef.current) return;
      const latest = contentRef.current;
      if (!latest.trim()) return;
      const save = onSaveSkillsRef.current;
      if (!save) return;
      const name = getDisplayName(latest);
      if (isNewRef.current) {
        save([...projectSkillsRef.current, { name, content: latest }]);
      } else {
        const updated = projectSkillsRef.current.map((s, i) =>
          i === skillIndexRef.current ? { ...s, name, content: latest } : s
        );
        save(updated);
      }
    };
  }, []);

  const handleSave = () => {
    const name = getDisplayName(content);
    if (isNew) {
      onSaveSkills([...projectSkills, { name, content }]);
    } else {
      const updated = projectSkills.map((s, i) =>
        i === skillIndex ? { ...s, name, content } : s
      );
      onSaveSkills(updated);
    }
    setHasUnsavedChanges(false);
  };

  const handleChange = (value: string) => {
    setContent(value);
    setHasUnsavedChanges(true);
  };

  const displayName = getDisplayName(content);

  return (
    <Box
      className="h-full flex flex-col overflow-hidden"
      sx={{
        borderLeft: '1px solid var(--sl-border-default)',
        bgcolor: 'var(--sl-bg-base)',
      }}
    >
      {/* Header */}
      <Box
        className="flex items-center gap-2.5 flex-none px-6 py-3"
        sx={{ borderBottom: '1px solid var(--sl-border-subtle)' }}
      >
        <span style={{ color: 'var(--sl-brand-primary)' }}>
          <SkillGlyph svg={theme.icons?.skills} size={16} />
        </span>
        <span className="text-[13px] font-semibold text-sl-text-primary truncate">
          {displayName || (isNew ? 'New Skill' : 'Untitled Skill')}
        </span>
        <span
          className="text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide flex-shrink-0"
          style={{ border: '1px solid var(--sl-brand-alpha-30)', color: 'var(--sl-brand-primary)', opacity: 0.7 }}
        >
          Skill
        </span>
        {hasUnsavedChanges && (
          <CircleIcon sx={{ fontSize: 8, color: 'var(--sl-brand-primary)' }} />
        )}
        <span className="ml-auto text-[10px] text-sl-text-faint flex-shrink-0">
          Markdown &middot; auto-saves &middot; ⌘S
        </span>
      </Box>

      {/* Formatting toolbar */}
      <MarkdownToolbar textareaRef={textareaRef} value={content} onChange={handleChange} />

      {/* Editor — a colorized, full-height Markdown surface that fills the panel.
          A highlight backdrop shows the (frontmatter-colored) text; the textarea
          sits on top with transparent text so only the caret/selection show. */}
      <Box className="flex-1 relative overflow-hidden">
        <div
          ref={backdropRef}
          aria-hidden
          className="absolute inset-0 overflow-auto pointer-events-none"
          style={{ ...editorTextStyle, color: 'var(--sl-text-primary)' }}
        >
          {highlightFrontmatter(content)}
        </div>
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => handleChange(e.target.value)}
          onScroll={syncScroll}
          spellCheck={false}
          autoComplete="off"
          placeholder="Write this skill in Markdown — frontmatter (name, description) plus the instructions to follow…"
          className="absolute inset-0 w-full h-full resize-none"
          style={{
            ...editorTextStyle,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'transparent',
            caretColor: 'var(--sl-brand-primary)',
            overflowY: 'auto',
          }}
        />
      </Box>
    </Box>
  );
}
