
import { conversationService } from '@/app/services/conversation.service';
import { storageService } from '@/app/services/storage.service';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Box, CircularProgress, Tooltip } from "@mui/material";
import { useChatSession, useChatStream } from '@/app/contexts/ChatSessionsContext';
import { StreamingMarker } from '@/app/components/activity-spinner';

import { Streamdown, defaultRehypePlugins, defaultRemarkPlugins } from 'streamdown';
import "streamdown/styles.css";
import { visit, SKIP } from 'unist-util-visit';
import { createCodePlugin } from "@streamdown/code";
const code = createCodePlugin({
  themes: ['github-light', 'github-dark'],
});
import { mermaid } from "@streamdown/mermaid";
import { math } from "@streamdown/math";
import { cjk } from "@streamdown/cjk";

import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import ThumbDownIcon from '@mui/icons-material/ThumbDown';
import SaveAltIcon from '@mui/icons-material/SaveAlt';
import SearchIcon from '@mui/icons-material/Search';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import MessageInput from './message-input';
import { LogoMark } from './logo';
import ModelPicker from './model-picker';

import { getLocalApiEndpoint, BOOTSTRAP_MODEL } from '@/app/constants';
import { useAppStatus } from '@/app/contexts/AppStatusContext';
import { useModelStatus } from '@/app/contexts/ModelStatusContext';
import { usePanels } from '@/app/contexts/PanelContext';

import FormatQuoteIcon from '@mui/icons-material/FormatQuote';
import LinkIcon from '@mui/icons-material/Link';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';

import { CopyToClipboard } from 'react-copy-to-clipboard';

import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';

import '@/app/styles/chat.css';

interface Attachment {
  file_id: string;
  name?: string;
  size?: number;
  type?: string;
}

// Human-readable document type for a reference filename, derived from its extension.
const DOC_TYPE_LABELS: Record<string, string> = {
  pdf: 'PDF Document',
  md: 'Markdown Report',
  markdown: 'Markdown Report',
  txt: 'Text File',
  doc: 'Word Document',
  docx: 'Word Document',
  csv: 'CSV Spreadsheet',
  xls: 'Excel Spreadsheet',
  xlsx: 'Excel Spreadsheet',
  ppt: 'PowerPoint',
  pptx: 'PowerPoint',
  json: 'JSON File',
  html: 'HTML Document',
};
function docTypeLabel(name: string): string {
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  return DOC_TYPE_LABELS[ext] || (ext ? `${ext.toUpperCase()} File` : 'Document');
}

// Format a byte count as a compact, human-readable size (e.g. "1.2 MB").
function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

// How long the first message takes to rise into an emptied conversation. The
// composer itself doesn't animate — it snaps from the centre to the bottom — so
// this is the only motion in the empty→content change. Transform and opacity
// only, so it runs on the compositor and holds its frame rate through the work a
// send kicks off (mounting the transcript, opening the stream, writing to SQLite
// over IPC).
const TRANSCRIPT_FADE_MS = 140;

// Turn bare URLs in plain user-message text into clickable, themed links.
// Clicks are picked up by the document-level handler that opens web links externally.
/**
 * The footer's text while a response streams: whatever the backend last said it
 * was doing ("Reading document: sp97.pdf"), falling back to a generic line
 * before the first status arrives.
 *
 * Read straight off the trace store rather than kept as chat state. The version
 * this replaces queued the events and paced them through a dwell timer, which
 * was a second copy of the same data — and the reason a run's earlier steps used
 * to vanish. Here the store is the one source and the strip just reads it.
 */
function LiveStatusText({ status, phase }: { status: string | null; phase: string | null }) {
  // Read off the session rather than the trace store. `runTrace.getTurns()[0]`
  // means "the most recently started turn", which with two conversations running
  // is simply the wrong one — this tab would narrate the other tab's progress.
  if (phase === 'loading-model') return <>Loading model…</>;
  if (phase === 'reconnecting') return <>Reconnecting to the local server…</>;
  // Whatever the backend last said it was doing wins, including while the turn
  // is still queued: orchestration narrates itself ("Planning the response and
  // selecting tools") long before the first token, and replacing that with a
  // generic "waiting" would hide real progress. The generic line is only for the
  // gap before anything has come back at all.
  if (status) return <>{status}</>;
  if (phase === 'queued' || phase === 'connecting') return <>Waiting for the model…</>;
  return <>Generating response…</>;
}

const USER_URL_REGEX = /(https?:\/\/[^\s<>()]+)/g;
function renderUserMessageContent(text: string): React.ReactNode[] {
  return text.split(USER_URL_REGEX).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} rel="noopener noreferrer">
        <LinkIcon className="user-message-link-icon" sx={{ fontSize: 14 }} />
        {part.replace(/^https?:\/\//, '').replace(/\/$/, '')}
      </a>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    )
  );
}

interface OpenTabRequest {
  id: string;
  type: 'conversation' | 'document' | 'skill' | 'mcp';
  title: string;
  data?: any;
}

// Streamdown sanitizes markdown links through rehype-sanitize (defaultSchema, which
// only permits http/https/mailto/... href protocols) and then rehype-harden. A local
// file target — e.g. Windows `C:/Users/.../fund_summary_txt.md` (protocol `c:`),
// a `file://` URL, or a POSIX absolute path — has its href stripped by sanitize, so
// harden then renders it as "<name> [blocked]". This is why generated-file links
// break on Windows (the model emits drive-letter paths). Neither plugin exposes a
// setting to allow local paths (harden hardcodes `file:` as blocked; sanitize gates
// by scheme), so we rewrite the href ourselves.
//
// Doing this as a rehype plugin that runs *before* sanitize (rather than a raw-text
// pass) means we only touch real anchor/image nodes — link-like text inside code
// blocks is left untouched. Local targets become `https://sl.local/open?p=<path>`,
// which survives sanitize + harden; the link-click handler intercepts that host and
// hands the real path to the OS file opener.
const LOCAL_LINK_TARGET_RE = /^(?:file:\/\/|~[\\/]|\/[^/]|[a-zA-Z]:[\\/]|\\\\)/;

// mdast-util-to-hast normalizes link URLs on the way to hast, so by the time this
// runs a path's spaces are already `%20` and its backslashes `%5C`. Decoding first
// keeps us from re-encoding that (`%20` -> `%2520`, which the click handler would
// hand to the OS as a literal "%20" in the filename) and restores the drive-letter
// and `~` shapes LOCAL_LINK_TARGET_RE matches on. Malformed escapes are left as-is.
const decodeTarget = (target: string): string => {
  try {
    return decodeURIComponent(target);
  } catch {
    return target;
  }
};

const toLocalOpenUrl = (target: unknown): string | null => {
  if (typeof target !== 'string') return null;
  const decoded = decodeTarget(target);
  if (!LOCAL_LINK_TARGET_RE.test(decoded)) return null;
  // Strip only the scheme + authority: `file:///Users/x` -> `/Users/x`. Consuming
  // the third slash too would yield the relative `Users/x`, which resolves nowhere.
  const path = decoded.replace(/^file:\/\//i, '');
  return `https://sl.local/open?p=${encodeURIComponent(path)}`;
};

// Rewrite local-file <a href> / <img src> to a sanitizer-safe URL before Streamdown's
// sanitize/harden plugins run.
const rehypeLocalFileLinks = () => (tree: any) => {
  visit(tree, 'element', (node: any) => {
    const attr = node.tagName === 'a' ? 'href' : node.tagName === 'img' ? 'src' : null;
    if (!attr || !node.properties) return;
    const rewritten = toLocalOpenUrl(node.properties[attr]);
    if (rewritten) node.properties[attr] = rewritten;
  });
};

const chatRehypePlugins = [rehypeLocalFileLinks, ...Object.values(defaultRehypePlugins)];

// A CommonMark link destination that is not wrapped in <> may not contain spaces,
// so `[name](/Users/me/Library/Application Support/.../out.md)` never parses as a
// link at all — it survives as literal text and rehypeLocalFileLinks (which only
// visits real anchor nodes) never sees it. This bites only the sandboxed Mac App
// Store build, whose container path contains "Application Support"; the Developer
// ID build writes to ~/.smartloop/... and has no spaces, which is why generated
// file links render there and not in the store build.
//
// Recover those links at the remark stage, where mdast still distinguishes prose
// from code: visiting `text` nodes leaves `code`/`inlineCode` content untouched,
// preserving the same code-block safety the rehype pass was written for.
const LOCAL_LINK_TEXT_RE =
  /\[([^\]\n]*)\]\(((?:file:\/\/|~[\\/]|\/[^/]|[a-zA-Z]:[\\/]|\\\\)[^)\n]*)\)/g;

const remarkLocalFileLinks = () => (tree: any) => {
  visit(tree, 'text', (node: any, index: number | undefined, parent: any) => {
    if (!parent || index === undefined || !node.value) return;
    if (!node.value.includes('](')) return;

    const children: any[] = [];
    let last = 0;
    LOCAL_LINK_TEXT_RE.lastIndex = 0;
    for (let m = LOCAL_LINK_TEXT_RE.exec(node.value); m; m = LOCAL_LINK_TEXT_RE.exec(node.value)) {
      const [match, label, target] = m;
      // Destinations without spaces already parse as links on their own; leaving
      // them to the normal pipeline keeps this plugin to the one case it fixes.
      if (!target.includes(' ')) continue;
      if (m.index > last) children.push({ type: 'text', value: node.value.slice(last, m.index) });
      children.push({
        type: 'link',
        url: target,
        children: [{ type: 'text', value: label || target.split(/[\\/]/).pop() }],
      });
      last = m.index + match.length;
    }
    if (!children.length) return;
    if (last < node.value.length) children.push({ type: 'text', value: node.value.slice(last) });

    parent.children.splice(index, 1, ...children);
    return [SKIP, index + children.length];
  });
};

const chatRemarkPlugins = [remarkLocalFileLinks, ...Object.values(defaultRemarkPlugins)];


// The status bar has room for two hints, so instead of listing bindings it
// points at the full list: "?" opens the keybinds dialog (handler in
// Home.tsx). Labelled as the bare character — typing it already needs Shift.
const KEYBINDS_HOTKEY = '\u21e7?';

export default function Chat(props: {
  project?: any,
  initialMessage?: string | null,
  onTokenUpdate?: () => void,
  attachments?: Attachment[],
  onAttachmentsClear?: () => void,
  onFileAttached?: (documentId: string, fileName: string) => void,
  conversation?: any,
  // The parent is still resolving which conversation this tab holds. Until it
  // settles, the view must not commit to showing the empty state — see
  // `hydratingContent`.
  conversationHydrating?: boolean,
  onConversationCreated?: (conversation: any) => void,
  onConversationUpdate?: (conversation: any) => void,
  onOpenTab?: (tab: OpenTabRequest) => void,
  onCreateSkill?: (name: string) => void,
  // Bumped by the parent to pull focus into the composer — set after a project
  // is created, so the new project opens ready to type into.
  focusComposerTrigger?: number
}) {
  const messagesEndRef = useRef<null | HTMLDivElement>(null)

  const [formData, setFormData] = useState({
    message: "",
  });
  // Right-click context menu (Copy / Quote) shown over a selection in an assistant message.
  // The native selection is left intact so text can still be copied normally (Cmd+C).
  const [selectionMenu, setSelectionMenu] = useState<{ text: string; x: number; y: number } | null>(null);
  const messageAttachmentsRef = useRef<Attachment[]>([]);
  const [clearAttachmentTrigger, setClearAttachmentTrigger] = useState(0);

  // User skills for the "/" picker. Fetched from the dedicated project skills
  // endpoint — the same source the right sidebar uses — which returns only
  // user-authored skills (built-in/system tool skills are excluded there).
  const [skillList, setSkillList] = useState<Array<{ name: string; description?: string }>>([]);
  useEffect(() => {
    const projectId = props.project?.id;
    if (!projectId) { setSkillList([]); return; }
    let cancelled = false;
    const load = async () => {
      try {
        const base = await getLocalApiEndpoint();
        const res = await fetch(`${base}/v1/projects/${projectId}/skills`);
        if (cancelled || !res.ok) return;
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data?.skills ?? []);
        setSkillList(
          list
            .map((s: any) => ({ name: s.name || '', description: s.description || '' }))
            // Drop deprecated built-ins (e.g. fetch-url) so they don't show in the picker.
            .filter((s: any) => s.name && s.name.replace(/[\s_-]+/g, '').toLowerCase() !== 'fetchurl')
        );
      } catch { if (!cancelled) setSkillList([]); }
    };
    load();
    // Keep the picker in sync when skills are created/edited/deleted elsewhere.
    window.addEventListener('skillsSaved', load);
    return () => { cancelled = true; window.removeEventListener('skillsSaved', load); };
  }, [props.project?.id]);

  const [searchQuery] = useState("");
  const [filteredMessages, setFilteredMessages]: any = useState([]);
  // The user's message, on screen before the conversation row exists. Filtered
  // straight back out once the session owns a turn with the same id, so it is a
  // stand-in for exactly the round-trip it takes main to accept the send.
  const [pendingUserMsg, setPendingUserMsg] = useState<any>(null);
  // Covers the same gap for the busy indicator: the session has no phase yet.
  const [starting, setStarting] = useState(false);
  // See conversationIdForSession below.
  const [justCreatedConversationId, setJustCreatedConversationId] = useState<string | null>(null);
  const [copied, setCopied]: any = useState("");
  const [saved, setSaved]: any = useState("");
  const [saving, setSaving]: any = useState("");
  const [feedback, setFeedback] = useState<Record<string, 'up' | 'down'>>({});
  const currentConversationIdRef = useRef<string | null>(null);
  const sendingMessageRef = useRef<boolean>(false);  // Reentrancy guard for the pre-send work only
  const [lastRunTps, setLastRunTps] = useState<number | null>(null);  // Last known tok/s shown in the idle status slot; seeded from storage, null until first-ever response
  const [isServiceReady, setIsServiceReady] = useState(false);
  const [model, setModel] = useState<string>('');
  // Armed by a send, disarmed by a conversation load: which of the two reasons the
  // transcript just went from empty to full, and so whether the message rises into
  // place or is simply already there.
  const animateLayoutRef = useRef(false);
  // The transcript's scroll container — the one thing the empty→content change
  // animates.
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  // Bumped when an example prompt fills the composer, to pull focus there.
  const [composerFocusTrigger, setComposerFocusTrigger] = useState(0);
  const [imagePreviews, setImagePreviews] = useState<Record<string, string>>({});  // asset_id -> data URL for image attachments in the transcript
  const requestedPreviewsRef = useRef<Set<string>>(new Set());  // asset_ids already requested, to avoid duplicate reads
  const { indexingProgress } = useAppStatus();
  // Model status is owned by the main process and mirrored by ModelStatusContext;
  // this component only reads it. `enabledCapabilities` already accounts for a
  // pending toggle, so vision unlocks the instant the user enables the model.
  const { primaryProgress, enabledCapabilities, waitForPrimaryModel } = useModelStatus();
  const modelDownloadProgress = primaryProgress;
  // The live turn for the conversation on screen. Held above <Routes>, so it is
  // the same object whether or not this component has been mounted the whole
  // time — switching tabs or visiting Settings no longer interrupts anything.
  // props.conversation lags a freshly created row by a render or two — the
  // parent has to hear about it, rewrite the conv-new tab and navigate first. The
  // session is keyed on the real id from the moment it is created, so without
  // this the streaming answer would have nowhere to land for that window.
  const conversationIdForSession = props.conversation?.id ?? justCreatedConversationId;
  const history = useMemo(() => {
    const committed = props.conversation?.messages || [];
    return pendingUserMsg ? [...committed, pendingUserMsg] : committed;
  }, [props.conversation?.messages, pendingUserMsg]);
  const session = useChatSession(conversationIdForSession, history);
  const messages = session.messages;
  const chatStream = useChatStream();
  const isLoading = starting || session.busy;
  // Image attachments require a vision-capable model — the SLP backend
  // OCRs/describes images through it at attachment-upload time.
  const visionEnabled = enabledCapabilities.has('vision');

  // Whether an attachment name looks like an image (gates asset preview loading)
  const isImageName = (name?: string): boolean => {
    const lower = (name || '').toLowerCase();
    return lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg');
  };

  // Load last tok/s value from SQLite (tps_history is the single source of truth)
  useEffect(() => {
    storageService.getTpsHistory(1).then((history) => {
      const val = history[history.length - 1]?.tokens_per_second;
      if (val) setLastRunTps(prev => prev ?? val);
    });
  }, []);

  // Each finished turn reports its own speed: main measures it from the first
  // token and writes the tps_history row, so the seed above only has to cover
  // a cold start.
  useEffect(() => {
    if (session.tokensPerSecond) setLastRunTps(session.tokensPerSecond);
  }, [session.tokensPerSecond]);

  // Check if the SLP service is already available, and listen for it to come online
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const url = await getLocalApiEndpoint();
      if (!cancelled && url) setIsServiceReady(true);
    })();
    const handler = () => {
      if (!cancelled) setIsServiceReady(true);
    };
    window.addEventListener('slpServiceReady', handler);
    return () => { cancelled = true; window.removeEventListener('slpServiceReady', handler); };
  }, []);

  // Derive the model name for the status footer from project + stored selection.
  // /health polling lives in AppStatusContext.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const m = props.project?.model_name
        || await storageService.getItem('selected_model')
        || BOOTSTRAP_MODEL;
      if (!cancelled) setModel(m);
    })();
    return () => { cancelled = true; };
  }, [props.project]);

  // Log project prop for debugging
  useEffect(() => {
    console.log('[Chat] Project prop:', {
      project: props.project,
      projectId: props.project?.id,
      projectName: props.project?.title || props.project?.name
    });
  }, [props.project]);

  // Update attachments when props change
  // Only update ref if props.attachments is provided and not empty
  // Don't clear ref if props.attachments is empty - it might be cleared after message is sent
  useEffect(() => {
    console.log('[Chat useEffect] Attachments prop updated:', props.attachments);
    if (props.attachments && props.attachments.length > 0) {
      console.log('[Chat useEffect] Setting ref to:', props.attachments);
      messageAttachmentsRef.current = [...props.attachments];
    }
    // Don't clear ref when props.attachments is empty - preserve attachments until message is sent
    console.log('[Chat useEffect] Ref after update:', messageAttachmentsRef.current);
  }, [props.attachments]);

  // Resolve inline previews for image attachments in the transcript. The raw bytes
  // live at ~/.smartloop/assets/<asset_id>; the main process reads them as data URLs.
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.readAssetDataUrl) return;
    messages.forEach((msg: any) => {
      (msg.attachments || []).forEach((att: any) => {
        if (!att.file_id?.startsWith('file-')) return;
        if (!isImageName(att.name)) return;
        const assetId = att.file_id.replace(/^file-/, '');
        if (requestedPreviewsRef.current.has(assetId)) return;
        requestedPreviewsRef.current.add(assetId);
        api.readAssetDataUrl(assetId).then((res) => {
          if (res?.success && res.dataUrl) {
            setImagePreviews(prev => ({ ...prev, [assetId]: res.dataUrl! }));
          }
        });
      });
    });
  }, [messages]);


  // Clear any existing quote highlights
  const clearQuoteHighlight = () => {
    const existingHighlights = document.querySelectorAll('.quote-highlight');
    existingHighlights.forEach((el) => {
      const parent = el.parentNode;
      if (parent) {
        // Replace the highlight span with its text content
        const textNode = document.createTextNode(el.textContent || '');
        parent.replaceChild(textNode, el);
        parent.normalize(); // Merge adjacent text nodes
      }
    });
  };

  // Explicitly quote the given text, wrapping the current selection in a persistent
  // highlight span for visual feedback. Triggered by the context menu.
  const quoteText = (text: string) => {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      clearQuoteHighlight();
      try {
        const range = selection.getRangeAt(0);
        const highlightSpan = document.createElement('span');
        highlightSpan.className = 'quote-highlight';
        range.surroundContents(highlightSpan);
      } catch (e) {
        // surroundContents fails when the selection spans multiple elements;
        // quote the text anyway, just without the visual highlight.
        console.log('Could not highlight selection spanning multiple elements');
      }
      selection.removeAllRanges();
    }
    // Insert the quote as an editable markdown blockquote at the top of the composer
    // so the user can trim or annotate it before sending.
    const quoted = `> ${text.split('\n').join('\n> ')}\n\n`;
    setFormData(prev => ({ message: quoted + prev.message }));
    setSelectionMenu(null);
    // Focus the composer and drop the cursor just after the quote block.
    requestAnimationFrame(() => {
      const el = document.querySelector('textarea[name="message"]') as HTMLTextAreaElement | null;
      if (el) {
        el.focus();
        el.setSelectionRange(quoted.length, quoted.length);
      }
    });
  };

  // Copy the given text to the clipboard via Electron's native clipboard.
  const copyText = (text: string) => {
    window.electronAPI?.writeClipboard(text);
    window.getSelection()?.removeAllRanges();
    setSelectionMenu(null);
  };

  // Right-click over a selection inside an assistant message → Copy / Quote menu.
  const handleContextMenu = (e: MouseEvent) => {
    const selection = window.getSelection();
    const text = selection?.toString().trim() ?? "";
    const target = e.target as HTMLElement | null;
    if (!text || !target?.closest('.chat-content')) return;
    e.preventDefault();
    setSelectionMenu({ text, x: e.clientX, y: e.clientY });
  };

  // Attach selection listeners. Hide the context menu when a new interaction begins
  // or the user presses Escape.
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('.selection-context-menu')) return;
      setSelectionMenu(null);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectionMenu(null);
    };
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);



  const handleFileAttached = (documentId: string, fileName: string) => {
    const newAttachments = [{ file_id: `file-${documentId}`, name: fileName }];
    console.log('[Chat handleFileAttached] Setting attachments:', newAttachments);
    messageAttachmentsRef.current = newAttachments;
    console.log('[Chat handleFileAttached] Ref after update:', messageAttachmentsRef.current);

    // Notify parent component if callback provided
    if (props.onFileAttached) {
      console.log('[Chat handleFileAttached] Notifying parent');
      props.onFileAttached(documentId, fileName);
    }
  };

  const sendMessage = async (_: any, messageOverride?: string) => {
    // Prevent duplicate sends
    if (isLoading || sendingMessageRef.current) {
      console.log('[Chat] Already sending a message, skipping duplicate send');
      return;
    }

    const userMessage = messageOverride || formData.message.trim();

    if (userMessage.length === 0) {
      console.log('Empty message, skipping');
      return;
    }

    // The quote (if any) is already part of the composer text; just clear the
    // lingering highlight on the source message.
    clearQuoteHighlight();

    // Mark as sending
    sendingMessageRef.current = true;
    // Arm the empty→content glide for this send. A ref, not state: it has to be
    // true in the very render that the setMessages below triggers, and a state
    // update would only land a commit later — after the layout had already
    // snapped.
    animateLayoutRef.current = true;

    // UUIDs, not timestamps: `addMessages` is INSERT OR REPLACE keyed on this id,
    // so two tabs sending in the same millisecond used to overwrite each other's
    // message. Harmless while only one turn could run; not once they run at once.
    const messageId = `msg-${crypto.randomUUID()}`;
    const responseId = `temp-${crypto.randomUUID()}`;

    const effectiveProjectId = props.project?.id;
    console.log('Sending message:', userMessage, 'Project ID:', effectiveProjectId);

    // Use attachments from props if available, fallback to ref
    // IMPORTANT: Check props first (most up-to-date), then ref (from previous props update)
    // This ensures attachments from welcome screen are used correctly
    console.log('[Chat sendMessage] props.attachments:', props.attachments);
    console.log('[Chat sendMessage] messageAttachmentsRef.current:', messageAttachmentsRef.current);
    let currentAttachments = props.attachments && props.attachments.length > 0
      ? [...props.attachments]  // Use props first - most current
      : (messageAttachmentsRef.current.length > 0
        ? [...messageAttachmentsRef.current]  // Fallback to ref
        : []);

    // Create conversation if it doesn't exist (first message)
    // Use ref as primary source of truth (updated immediately when conversation is created)
    // Fallback to props.conversation?.id only for initial load
    let conversationId = currentConversationIdRef.current || props.conversation?.id;

    // If conversation already exists, check if this is the first message
    // For the first message, we should still include project attachment even if conversation exists
    // (because conversation was just created and this is the first message being sent)
    const isFirstMessage = !messages || messages.length === 0;

    if (conversationId && !isFirstMessage) {
      // Filter out project attachments only for subsequent messages
      // Backend uses memory and project_id, so no need to send project attachment again
      currentAttachments = currentAttachments.filter(
        (att: any) => !att.file_id || !att.file_id.startsWith('project-')
      );
      console.log('[Chat sendMessage] Filtered out project attachments for existing conversation (not first message):', conversationId);
    }

    // Always add project attachment for first message if project is selected and attachment doesn't exist
    // This handles the case when sending from welcome screen where attachments might not be passed correctly
    if (isFirstMessage && props.project?.id) {
      const projectAttachment = {
        file_id: `project-${props.project.id}`,
        name: props.project.title || props.project.name || 'Project'
      };
      // Check if project attachment already exists
      const hasProjectAttachment = currentAttachments.some(
        (att: any) => att.file_id === projectAttachment.file_id
      );
      if (!hasProjectAttachment) {
        currentAttachments.push(projectAttachment);
        console.log('[Chat sendMessage] Added project as attachment (first message, project selected):', projectAttachment);
      } else {
        console.log('[Chat sendMessage] Project attachment already exists in currentAttachments');
      }
    }
    console.log('[Chat sendMessage] currentAttachments to send:', currentAttachments);

    // Onto the screen before anything is awaited. The conversation row below is
    // created over IPC, and hanging the user's own message on that round-trip meant
    // the empty→content layout — and so the composer's glide off the centre — began
    // whenever SQLite came back, which landed it next to the opening of the stream
    // instead of next to the click that caused it. Persisting can be late; showing
    // what the user just typed cannot. Rolled back below if the send can't start.
    const userMsg = {
      id: messageId,
      role: 'user',
      content: userMessage,
      attachments: currentAttachments.length > 0 ? currentAttachments : undefined
    };
    console.log('[Chat sendMessage] Created userMsg:', userMsg);
    console.log('[Chat sendMessage] userMsg.attachments:', userMsg.attachments);
    setPendingUserMsg(userMsg);
    // Emptied in the same commit: text left sitting in a composer that has already
    // started moving reads as a send that didn't take.
    setFormData({ message: "" });
    // Same reasoning as the message above — the streaming marker belongs to the
    // click, not to the IPC. Set here, it lights up as the composer starts moving,
    // which is what covers the gap until the first token actually arrives.
    setStarting(true);

    // Put the composer and the transcript back the way they were — the send never
    // started, so the centred empty layout is still the truthful one.
    const rollbackSend = () => {
      setPendingUserMsg(null);
      setFormData({ message: userMessage });
      animateLayoutRef.current = false;
    };

    if (!conversationId) {
      console.log('[Chat] No conversation exists, creating new one...');
      // Generate title from first 5 words of message
      const words = userMessage.split(' ');
      const titleWords = words.slice(0, 5).join(' ');
      const conversationTitle = words.length > 5 ? `${titleWords}...` : titleWords;

      try {
        const projectId = props.project?.id || null;
        const conversationResult = await conversationService.createConversation({
          title: conversationTitle,
          project_id: projectId
        });

        if (conversationResult.success && conversationResult.data) {
          conversationId = conversationResult.data.id;
          console.log('[Chat] Created new conversation:', conversationId);

          // Update the ref immediately so subsequent messages know the conversation exists
          currentConversationIdRef.current = conversationId;
          setJustCreatedConversationId(conversationId);

          // Notify parent component
          if (props.onConversationCreated) {
            props.onConversationCreated(conversationResult.data);
          }
        } else {
          console.error('[Chat] Failed to create conversation:', conversationResult.error);
          alert('Failed to create conversation. Please try again.');
          rollbackSend();
          sendingMessageRef.current = false;
          setStarting(false);
          return;
        }
      } catch (error: any) {
        console.error('[Chat] Error creating conversation:', error);
        alert('Failed to create conversation. Please try again.');
        rollbackSend();
        sendingMessageRef.current = false;
        setStarting(false);
        return;
      }
    }

    console.log('Using conversation ID:', conversationId);

    // Messages are now managed via conversation state - synced via onConversationUpdate callback
    // (the message itself, and the composer clear, happened before the await above)

    // Clear attachments AFTER they've been used in the message
    // Don't clear immediately - let them be used first
    setClearAttachmentTrigger(prev => prev + 1); // Trigger FileAttacher to clear
    if (props.onAttachmentsClear) {
      props.onAttachmentsClear();
    }
    // Clear ref after a small delay to ensure message was sent with attachments
    setTimeout(() => {
      messageAttachmentsRef.current = [];
    }, 100);

    // The turn itself now belongs to the main process: the request, the SSE
    // loop, the 503/reconnect retries, the abort, and writing both messages to
    // SQLite. This component only says "send" and then renders whatever the
    // session reports — which is the whole reason the answer survives it
    // unmounting.
    const selectedModel = await storageService.getItem('selected_model') || 'gemma3-1b';

    let temperature = 0.3;
    try {
      const savedTemp = await storageService.getSetting('default_temperature');
      if (savedTemp !== null && savedTemp !== undefined) temperature = savedTemp;
    } catch { /* fall back to the default */ }

    // Wait out an in-flight primary model load. Main retries its own 503, but
    // waiting here means the composer says "loading" rather than going quiet.
    if (modelDownloadProgress?.downloading) {
      console.log('[Chat] Waiting for model init to complete...');
      await waitForPrimaryModel();
    }

    const result = await chatStream.send({
      conversationId,
      userMessageId: messageId,
      responseMessageId: responseId,
      text: userMessage,
      model: selectedModel,
      temperature,
      projectId: props.project?.id ? String(props.project.id) : null,
      cwd: props.project?.folder_path || null,
      projectInstructions: props.project?.instructions || null,
      attachments: currentAttachments.length > 0 ? currentAttachments : null,
    });

    sendingMessageRef.current = false;
    setStarting(false);

    if (!result.success) {
      console.error('[Chat] Send rejected:', result.error);
      // Every rejection means this message did not go anywhere — including
      // 'already-streaming', which only happens if our view of the session was
      // stale. Putting the text back in the composer is the truthful outcome;
      // leaving the bubble up would show a message that was never sent.
      rollbackSend();
    }
  }

  // Reset input when conversation changes (switching tabs)
  useEffect(() => {
    // A conversation being loaded lands in its final layout without animating
    // there; only a send earns the glide.
    animateLayoutRef.current = false;
    // Reset input box when switching to a different conversation
    setFormData({ message: "" });
    clearQuoteHighlight();
    messageAttachmentsRef.current = [];
    setClearAttachmentTrigger(prev => prev + 1);
    // Drop the just-created fallback as soon as the prop moves at all. Left
    // standing it would point a genuinely new tab — where props.conversation is
    // null — at the previous conversation's session.
    setJustCreatedConversationId(null);
  }, [props.conversation?.id]);

  // Resolve the conversation on screen and load its feedback.
  //
  // It no longer loads *messages*: the committed ones arrive as a prop and the
  // live turn comes from the session. The bail-out that used to sit here — skip
  // while sending — is gone with them, and deliberately: it is what made
  // switching tabs mid-stream keep showing the streaming conversation's
  // transcript under the other tab's title. There is nothing left to clobber.
  useEffect(() => {
    const incomingConversationId = props.conversation?.id ?? null;
    if (incomingConversationId && incomingConversationId === currentConversationIdRef.current) {
      return;
    }

    const conversationMessages = props.conversation?.messages || [];

    console.log('[Chat] Conversation changed:', {
      id: props.conversation?.id,
      messagesCount: conversationMessages.length
    });

    // A stand-in only ever belongs to the conversation it was typed into.
    setPendingUserMsg(null);

    // Update conversation ref
    currentConversationIdRef.current = incomingConversationId;

    // Load feedback state for this conversation
    const convId = props.conversation?.id;
    if (convId) {
      (async () => {
        try {
          const baseUrl = await getLocalApiEndpoint();
          const projectId = props.project?.id ? `&project_id=${encodeURIComponent(props.project.id)}` : '';
          const res = await fetch(`${baseUrl}/v1/feedback?session_id=${encodeURIComponent(convId)}${projectId}`);
          if (res.ok) {
            const data = await res.json();
            console.log('[Chat] Feedback response:', JSON.stringify(data));
            console.log('[Chat] Message IDs in conversation:', conversationMessages.map((m: any) => ({ id: m.id, message_id: m.message_id, role: m.role })));
            const feedbackMap: Record<string, 'up' | 'down'> = {};
            const entries: Array<{ message_id: string; rating: 'up' | 'down' }> = Array.isArray(data) ? data : Object.entries(data).map(([k, v]) => ({ message_id: k, rating: v as 'up' | 'down' }));
            for (const entry of entries) {
              const backendMsgId = entry.message_id;
              feedbackMap[backendMsgId] = entry.rating;
              // For messages where local id differs from backend message_id,
              // also key by local id so UI lookup works
              const localMsg = conversationMessages.find((m: any) =>
                (m.message_id === backendMsgId || m.id === backendMsgId) && m.role === 'assistant'
              );
              if (localMsg) {
                feedbackMap[localMsg.message_id || localMsg.id] = entry.rating;
              }
            }
            console.log('[Chat] Feedback map:', feedbackMap);
            setFeedback(feedbackMap);
          }
        } catch { }
      })();
    } else {
      setFeedback({});
    }

    // Keyed on the conversation id rather than the object: an unrelated project
    // patch (toggling web_search, say) hands back a new reference with the same
    // id, and re-running this would refetch feedback for no reason. `messages`
    // is read inside but deliberately not a dependency — it changes on every
    // turn, and this only has work to do when the conversation itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.conversation?.id, props.project?.id]);

  // Tell the parent a turn finished, so the tab title and the sidebar refresh.
  // It no longer carries the messages: main writes both rows itself as the turn
  // runs, and a second writer sending the whole array from here would let a
  // stale renderer copy overwrite newer text.
  const lastNotifiedTurnRef = useRef<string | null>(null);
  useEffect(() => {
    const convId = props.conversation?.id;
    if (!convId || !props.onConversationUpdate) return;
    if (session.busy || !session.phase) return;
    const key = `${convId}:${session.phase}`;
    if (lastNotifiedTurnRef.current === key) return;
    lastNotifiedTurnRef.current = key;
    props.onConversationUpdate({ ...props.conversation, id: convId, updated_at: new Date().toISOString() });
  }, [session.phase, session.busy, props.conversation?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // There is deliberately no unmount abort here any more. Aborting on unmount is
  // what killed a turn whenever the user opened Settings or a document tab; the
  // stream belongs to the main process now and outlives this component.

  // Handle link clicks: web links -> system browser; local file paths -> system default app
  useEffect(() => {
    const handleLinkClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Check if the clicked element is an anchor tag or inside one
      const anchor = target.closest('a');
      if (!anchor) return;

      // Use raw href attribute to avoid browser-resolved absolute URLs for local paths
      const rawHref = anchor.getAttribute('href') || '';
      const resolvedHref = anchor.href || '';
      if (!rawHref && !resolvedHref) return;

      const electronAPI = (window as any).electronAPI;

      // Local-file links rewritten by rehypeLocalFileLinks — hand the real path to the OS opener
      if (rawHref.startsWith('https://sl.local/open')) {
        e.preventDefault();
        try {
          const localPath = new URL(rawHref).searchParams.get('p');
          if (localPath && electronAPI?.openInFinder) electronAPI.openInFinder(localPath);
        } catch {
          // malformed rewrite — ignore
        }
        return;
      }

      // Web links — open in system browser
      if (rawHref.startsWith('http://') || rawHref.startsWith('https://')) {
        e.preventDefault();
        if (electronAPI?.openExternal) {
          electronAPI.openExternal(rawHref);
        } else {
          window.open(rawHref, '_blank', 'noopener,noreferrer');
        }
        return;
      }

      // Local file — open markdown in tab, others with system default app
      const isFileScheme = rawHref.startsWith('file://');
      const isAbsolutePath = rawHref.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(rawHref);
      const isHomePath = rawHref.startsWith('~');
      if (isFileScheme || isAbsolutePath || isHomePath) {
        e.preventDefault();
        const path = isFileScheme ? decodeURIComponent(rawHref.replace(/^file:\/\//, '')) : rawHref;

        if (electronAPI?.openInFinder) {
          electronAPI.openInFinder(path);
        }
      }
    };

    // Capture phase so we intercept before any library-level handlers
    document.addEventListener('click', handleLinkClick, true);
    return () => {
      document.removeEventListener('click', handleLinkClick, true);
    };
  }, [props.onOpenTab]);

  // Messages are now managed via conversation service state
  // No need for backup saves - messages are synced to server after each exchange

  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredMessages(messages);
    } else {
      const filtered = messages.filter((msg: any) => {
        return msg.payload.text.toLowerCase().includes(searchQuery.toLowerCase());
      });
      setFilteredMessages(filtered);
    }
  }, [searchQuery, messages]);

  // Messages are stored in the database via conversation, no localStorage needed
  // The backend handles persistence

  const displayMessages = searchQuery.trim() === "" ? messages : filteredMessages;
  // Nothing said yet — and not mid-search or mid-download, both of which have
  // their own things to show in the message area.
  // Nothing is "empty" until we know what the conversation holds. The parent
  // restores the active tab asynchronously, so on a remount (navigating back
  // from Settings) `props.conversation` is null for as long as that read takes;
  // without `conversationHydrating` the empty view paints first and flicks to
  // the content of a tab that always had some. `messages` itself no longer lags:
  // it is derived from the prop and the live session rather than copied into
  // state by an effect, so it is right on the first render.
  const hydratingContent = props.conversationHydrating
    || (props.conversation?.messages?.length ?? 0) > 0;
  const isEmptyConversation = (displayMessages || []).length === 0
    && !hydratingContent
    && searchQuery.trim() === ""
    && !modelDownloadProgress;
  // The centred empty layout — mark above the composer, composer floated into
  // the upper half of a 760px column — assumes the window has room to spare.
  // With a side panel open it doesn't: the conversation is already down to the
  // strip between two rails, and a narrow column hovering inside it reads as a
  // third gutter rather than a focal point. So an empty conversation next to an
  // open panel lays out like a running one — full width, composer at the bottom
  // — and keeps the openers, which are the part that's actually useful.
  const { anyPanelOpen } = usePanels();
  const centerEmptyState = isEmptyConversation && !anyPanelOpen;
  // The non-centred empty view fills its body with the Tips card instead of the
  // opener pills. The pills belong under a centred composer — strung along the
  // bottom of a full-width column they read as a toolbar — and the body they'd
  // otherwise leave blank is exactly the room the card wants.
  const showTips = isEmptyConversation && anyPanelOpen && isServiceReady && !!props.project;

  // The first message rising into the emptied conversation. The composer is NOT
  // animated with it: it snaps from the centre to the bottom, because a box gliding
  // down while the message it just sent was already on screen read as the input
  // lagging behind a conversation that had started without it.
  //
  // Gated on `animateLayoutRef` so only a send plays this. `messages` starts empty,
  // so opening a conversation that already has content would otherwise fade the
  // whole transcript in on every open, which reads as the app booting slowly.
  useLayoutEffect(() => {
    const transcript = transcriptRef.current;
    if (!transcript || centerEmptyState || !animateLayoutRef.current) return;
    // Clipped by the section's `contain: paint`, so the 6px of travel can't bleed
    // over the composer. Only the scroll container is touched — animating the
    // messages individually would mean a new animation per streamed chunk.
    const anim = transcript.animate(
      [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' }],
      { duration: TRANSCRIPT_FADE_MS, easing: 'cubic-bezier(0.2, 0, 0, 1)' }
    );
    transcript.style.willChange = 'transform, opacity';
    // Dropped as soon as it lands — a standing `will-change` would keep the
    // transcript on its own layer for the rest of the session.
    anim.finished.then(() => { transcript.style.willChange = ''; }).catch(() => {});
  }, [centerEmptyState]);

  // The composer, rendered either pinned to the bottom or centred in an empty
  // conversation. One definition, so the two placements cannot drift apart.
  // Openers for an empty conversation. Orientation first, then one that answers
  // on the spot, one that produces something, and one that's deliberately
  // unfinished — "the following content" is a lead-in the user completes by
  // pasting. That last one is why clicking fills the composer instead of
  // sending it.
  const EXAMPLE_PROMPTS = [
    'What can you do?',
    'Rewrite this to sound more professional',
    'Explain the theory of relativity',
    'Create a step-by-step project plan',
  ];

  const applyExamplePrompt = (text: string) => {
    setFormData({ message: text });
    setComposerFocusTrigger((n) => n + 1);
  };

  // Fold the parent's focus request into the composer's own trigger, so both
  // reasons to focus travel down the one channel.
  useEffect(() => {
    if (!props.focusComposerTrigger) return;
    setComposerFocusTrigger((n) => n + 1);
  }, [props.focusComposerTrigger]);

  const composerBlock = (
    <>
      <div className="flex items-center gap-1 px-1 text-[10px] text-sl-text-faint pointer-events-none overflow-hidden">
        {/* One bracketed marker at the head of the line, in the same idiom
                  as the [esc] / [?] hints on the right: a bar at rest, sweeping
                  through | / - \\ while a response streams. Both frames are
                  monospace at a fixed 6px, so the text beside them never shifts. */}
        {isLoading ? (
          <span className="flex items-center gap-1.5 text-sl-text-disabled min-w-0 overflow-hidden">
            <span className="flex items-center font-mono shrink-0">
              [<span className="mx-[3px]"><StreamingMarker /></span>]
            </span>
            <span className="truncate"><LiveStatusText status={session.lastStatus} phase={session.phase} /></span>
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-sl-text-disabled min-w-0 overflow-hidden">
            <span className="flex items-center font-mono shrink-0">
              [<span className="inline-block text-center mx-[3px]" style={{ width: 6 }}>-</span>]
            </span>
            <span className="truncate">Ready</span>
          </span>
        )}
      </div>
      <MessageInput
        message={formData.message}
        onMessageChange={(value) => setFormData({ message: value })}
        onSend={() => sendMessage(null)}
        onStop={() => {
          // A real disconnect in main, not a flag polled between chunks: the
          // AbortController here was never handed to the SDK, so stopping used
          // to leave the backend generating to the end.
          if (conversationIdForSession) chatStream.stop(conversationIdForSession);
        }}
        placeholder={modelDownloadProgress?.downloading
          ? "Waiting for model to be ready..."
          // Match the "/" picker's own availability: it opens when there are
          // skills to run OR skills can be created (onCreateSkill is set).
          : (skillList.length > 0 || !!props.onCreateSkill)
            ? "Enter your prompt, or type / to run or create skills"
            : "Enter your prompt..."}
        disabled={!isServiceReady || !!modelDownloadProgress?.downloading}
        isLoading={isLoading}
        allowAttachments={true}
        allowImages={visionEnabled}
        conversation={props.conversation}
        onFileAttached={handleFileAttached}
        onAttachmentClear={() => {
          setTimeout(() => {
            messageAttachmentsRef.current = [];
            if (props.onAttachmentsClear) {
              props.onAttachmentsClear();
            }
          }, 100);
        }}
        clearAttachmentTrigger={clearAttachmentTrigger}
        focusTrigger={composerFocusTrigger}
        showDragDrop={true}
        minRows={1}
        maxRows={4}
        skills={skillList}
        onCreateSkill={props.onCreateSkill}
        rightSlot={
          // Left enabled while a model loads: reaching for the switcher is
          // exactly what you do when a load is dragging, so a slow warm
          // shouldn't trap the choice the user is trying to get out of.
          <ModelPicker model={model} disabled={!isServiceReady} />
        }
      />
      <div className="flex items-center gap-1.5 px-1 mt-2 text-[10px] text-sl-text-faint leading-none">
        {isServiceReady ? (
          <>
            {indexingProgress ? (
              <span className="flex items-center gap-1">
                <span className="inline-block w-[7px] h-[7px] rounded-[1px] bg-sl-status-warning animate-pulse flex-shrink-0"></span>
                <span>indexing {indexingProgress.indexed}/{indexingProgress.total} documents</span>
              </span>
            ) : (
              <span className="flex items-center gap-[3px]" title={isLoading ? 'thinking' : 'ready'} aria-label={isLoading ? 'thinking' : 'ready'}>
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className={`inline-block w-[7px] h-[7px] rounded-[1px] flex-shrink-0${isLoading ? ' animate-pulse' : ''}`}
                    style={{
                      backgroundColor: isLoading ? 'var(--sl-brand-primary)' : 'var(--sl-text-faint)',
                      ...(isLoading ? { animationDelay: `${i * 180}ms` } : {}),
                    }}
                  ></span>
                ))}
              </span>
            )}
            {/* Last run's speed. The model isn't named here: the picker above
                already names it, and under Auto the turn may have gone to
                another model, so a name here could pair with the wrong speed. */}
            {lastRunTps ? <span className="tabular-nums text-sl-text-faint">{lastRunTps} tok/s</span> : null}
            <span className="flex items-center gap-1.5 ml-auto">
              <span><span className="text-sl-text-disabled">[esc]</span> <span className="text-sl-text-faint">interrupt</span></span>
              <span><span className="text-sl-text-disabled">[{KEYBINDS_HOTKEY}]</span> <span className="text-sl-text-faint">keybinds</span></span>
            </span>
          </>
        ) : (
          <span className="flex items-center gap-1">
            <span className="inline-block w-[7px] h-[7px] rounded-[1px] bg-sl-status-warning animate-pulse flex-shrink-0"></span>
            <span>starting</span>
          </span>
        )}
      </div>
    </>
  );


  return (
    <>
      <Box className="chat__box relative flex flex-col h-full bg-sl-bg-base overflow-hidden" sx={{ borderLeft: '1px solid var(--sl-border-subtle)' }}>
        {/* Kept in the layout when empty rather than hidden: it renders nothing
            then, but it's the flex-1 that fills the column and leaves the composer
            docked at the bottom. `contain` scopes its reflows to itself, so the
            composer changing height — a wrapped line, the empty→content swap —
            can't invalidate the transcript's layout or repaint it. */}
        <section className="chat__body flex-1 overflow-hidden" style={{ contain: 'layout paint' }}>
          <div ref={transcriptRef} className="flex flex-col-reverse h-full overflow-y-auto px-3 md:px-4 pt-8 md:pt-12 pb-4 md:pb-6 sidebar-scroll">
            <div ref={messagesEndRef} />

            {(displayMessages || []).length === 0 && searchQuery.trim() === "" && modelDownloadProgress &&
              <div className="flex flex-col gap-2 h-full w-full justify-center items-center px-3 md:px-6">
                <div className="flex-1"></div>
                <Box
                  sx={{
                    bgcolor: 'var(--sl-bg-surface-1)',
                    border: '1px solid var(--sl-border-default)',
                    borderRadius: '16px',
                    padding: { xs: '20px', md: '32px' },
                    maxWidth: '700px',
                    width: '100%',
                  }}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '40px',
                        height: '40px',
                        borderRadius: '10px',
                        bgcolor: 'var(--sl-brand-alpha-10)',
                        border: '1px solid var(--sl-brand-alpha-20)',
                      }}
                    >
                      <AutoAwesomeIcon sx={{ color: 'var(--sl-brand-primary)', fontSize: 24 }} />
                    </Box>
                    <div>
                      <h2 className="text-lg md:text-xl font-semibold text-sl-text-primary">Bootstrapping Model</h2>
                      <p className="text-xs text-sl-text-muted mt-0.5">{modelDownloadProgress.model?.replace(/-/g, ' ')}</p>
                    </div>
                  </div>

                  {/* Stage indicators */}
                  <div className="flex items-center gap-2 mb-3">
                    {['checking', 'downloading'].map((s) => {
                      const stageLabels: Record<string, string> = { checking: 'Checking', downloading: 'Downloading' };
                      const currentStage = modelDownloadProgress.stage || 'initializing';
                      const stageOrder = ['initializing', 'checking', 'downloading', 'extracting', 'verifying', 'preparing', 'complete'];
                      const currentIdx = stageOrder.indexOf(currentStage);
                      const thisIdx = stageOrder.indexOf(s);
                      const isActive = currentStage === s || (s === 'downloading' && (currentStage === 'extracting' || currentStage === 'verifying'));
                      const isDone = currentIdx > thisIdx && !isActive;
                      return (
                        <div key={s} className="flex items-center gap-1.5">
                          <div
                            className={`w-2 h-2 rounded-full ${isDone ? 'bg-sl-status-success' : isActive ? 'animate-pulse' : 'bg-sl-text-faint'}`}
                            style={isActive && !isDone ? { backgroundColor: 'var(--sl-brand-primary)' } : undefined}
                          />
                          <span className={`text-[10px] ${isActive ? 'text-sl-text-primary' : isDone ? 'text-sl-status-success' : 'text-sl-text-faint'}`}>
                            {stageLabels[s]}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs text-sl-text-muted">
                      <span>{modelDownloadProgress.status}</span>
                      <span>{modelDownloadProgress.percent > 0 ? `${modelDownloadProgress.percent}%` : ''}</span>
                    </div>
                    <Box
                      sx={{
                        width: '100%',
                        height: '6px',
                        borderRadius: '3px',
                        bgcolor: 'var(--sl-bg-surface-2)',
                        overflow: 'hidden',
                      }}
                    >
                      <Box
                        sx={{
                          width: `${modelDownloadProgress.percent}%`,
                          height: '100%',
                          borderRadius: '3px',
                          bgcolor: 'var(--sl-brand-primary)',
                          transition: 'width 0.3s ease',
                          ...(modelDownloadProgress.percent < 100 && modelDownloadProgress.percent > 0 ? {} : modelDownloadProgress.percent === 0 ? {
                            width: '30%',
                            animation: 'indeterminate 1.5s ease-in-out infinite',
                            '@keyframes indeterminate': {
                              '0%': { transform: 'translateX(-100%)' },
                              '100%': { transform: 'translateX(350%)' },
                            },
                          } : {}),
                        }}
                      />
                    </Box>
                    <p className="text-xs text-sl-text-disabled">Please wait as we download and prepare the model...</p>
                  </div>
                </Box>
                <div className="flex-1"></div>
              </div>
            }
            {showTips &&
              <div className="flex flex-col gap-2 h-full w-full justify-center items-center px-3 md:px-6">
                <div className="flex-1"></div>
                <Box
                  sx={{
                    bgcolor: 'transparent',
                    border: '1px solid var(--sl-border-subtle)',
                    borderRadius: '16px',
                    padding: { xs: '20px', md: '32px' },
                    maxWidth: '700px',
                    width: '100%',
                  }}
                >
                  <div className="flex items-center gap-3 mb-6">
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '40px',
                        height: '40px',
                        borderRadius: '10px',
                        bgcolor: 'var(--sl-brand-alpha-10)',
                        border: '1px solid var(--sl-brand-alpha-20)',
                      }}
                    >
                      <LightbulbIcon sx={{ color: 'var(--sl-brand-primary)', fontSize: 24 }} />
                    </Box>
                    <h2 className="text-lg md:text-xl font-semibold text-sl-text-primary">Tips to Get Started</h2>
                  </div>

                  {/* Each tip names a panel by its label, never by its icon.
                      The tip this replaces said to click a wrench in the right
                      panel: the rail's skills glyph was never that wrench, and
                      a theme can replace the glyph outright, so the sentence
                      was wrong twice over and had no way of staying right.
                      Labels are the part that holds still. */}
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <FiberManualRecordIcon sx={{ color: 'var(--sl-brand-primary)', fontSize: 8, mt: 0.8, flexShrink: 0 }} />
                      <p className="text-sl-text-tertiary text-xs md:text-sm leading-relaxed">
                        <span className="font-semibold text-sl-text-primary">Let Auto pick the model:</span> Turn on as many models as you like in the composer’s picker. Auto reads each request and routes it to whichever one has the capability it needs, so you never switch by hand
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      <FiberManualRecordIcon sx={{ color: 'var(--sl-brand-primary)', fontSize: 8, mt: 0.8, flexShrink: 0 }} />
                      <p className="text-sl-text-tertiary text-xs md:text-sm leading-relaxed">
                        <span className="font-semibold text-sl-text-primary">Enrich the project’s knowledge:</span> Add documents to the project and the assistant draws on them when a question calls for it, with references back to the ones it used
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      <FiberManualRecordIcon sx={{ color: 'var(--sl-brand-primary)', fontSize: 8, mt: 0.8, flexShrink: 0 }} />
                      <p className="text-sl-text-tertiary text-xs md:text-sm leading-relaxed">
                        <span className="font-semibold text-sl-text-primary">Teach it with skills:</span> Type <span className="font-mono text-sl-brand-primary">/skill-name</span> in the chat box to run a skill. Write and edit them in the Skills panel, and they apply to the whole project
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      <FiberManualRecordIcon sx={{ color: 'var(--sl-brand-primary)', fontSize: 8, mt: 0.8, flexShrink: 0 }} />
                      <p className="text-sl-text-tertiary text-xs md:text-sm leading-relaxed">
                        <span className="font-semibold text-sl-text-primary">Connect your tools:</span> Pick one from the Connections panel and click to connect, or paste any MCP server’s URL to add your own. Its tools are then called whenever a question needs them
                      </p>
                    </div>
                  </div>
                </Box>
                <div className="flex-1"></div>
              </div>
            }
            {(displayMessages || []).length === 0 && searchQuery.trim() !== "" &&
              <div className="flex flex-col gap-2 h-full w-full justify-center">
                <div className="flex justify-center">
                  <div className="bg-sl-bg-surface-2 rounded-lg p-8 text-center">
                    <SearchIcon sx={{ fontSize: 48, color: 'var(--sl-text-muted)' }} />
                    <p className="mt-4 text-sl-text-muted">No messages found matching "{searchQuery}"</p>
                  </div>
                </div>
              </div>
            }
            <div className="flex flex-col gap-6 w-full">
              {displayMessages && displayMessages.map((msg: any) => {
                return (
                  <React.Fragment key={msg.id}>
                    {msg.role === 'assistant' ?
                      <Box className="flex items-start gap-3 w-full">
                        <Box className="flex-1 min-w-0">
                          <div className="chat-paper p-3 md:p-5 text-sl-text-primary text-sm md:text-base leading-relaxed">
                            <div className="prose max-w-none chat-content">
                              {msg.is_new && !msg.content ? (
                                <span className="inline-block w-2 h-4 rounded-sm animate-pulse" style={{ backgroundColor: 'var(--sl-text-primary)' }} />
                              ) : (
                                <Streamdown
                                  mode={msg.is_new ? "streaming" : "static"}
                                  animated
                                  caret="block"
                                  controls={false}
                                  linkSafety={{ enabled: false }}
                                  rehypePlugins={chatRehypePlugins}
                                  remarkPlugins={chatRemarkPlugins}
                                  plugins={{ code, mermaid, math, cjk }}>
                                  {msg.content || ''}
                                </Streamdown>
                              )}
                            </div>
                            {msg.citations && msg.citations.length > 0 && !msg.is_new && (
                              <div className="mt-3 pt-3 border-t border-sl-border-subtle">
                                <p className="flex items-center gap-1.5 text-[10px] text-sl-text-disabled uppercase tracking-wider mb-2">
                                  <LinkIcon sx={{ fontSize: 12 }} />
                                  References
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  {msg.citations.map((citation: any, idx: number) => {
                                    const label = citation.document_name || citation.document_id;
                                    const url = [citation.url, citation.link, citation.source_url, citation.href, citation.web_url]
                                      .find((v: any) => typeof v === 'string' && v.trim())
                                      ?.trim() || '';
                                    const labelIsUrl = typeof label === 'string' && /^(https?:\/\/|www\.)/i.test(label);
                                    const isLink = !!url || labelIsUrl;
                                    const linkUrl = url || (labelIsUrl ? label : '');
                                    // Show only the base URL (scheme + host) in the pill. Paths,
                                    // query strings and hashes are what blow the layout out; the
                                    // full URL stays on the tooltip and is what actually opens.
                                    const baseUrl = (u: string) => {
                                      try {
                                        const parsed = new URL(/^www\./i.test(u) ? `https://${u}` : u);
                                        // `host`, not `hostname`: keeps a non-default port.
                                        return `${parsed.protocol}//${parsed.host.replace(/^www\./, '')}`;
                                      } catch { return u; }
                                    };
                                    const displayLabel = isLink
                                      ? baseUrl(linkUrl || label || '')
                                      : (label || '');
                                    const folderPath = props.project?.folder_path;
                                    // Prefer a path the backend gave us; only fall back to the
                                    // <project>/documents/<name> convention when it didn't.
                                    const citedPath = [citation.file_path, citation.path, citation.source_path]
                                      .find((v: any) => typeof v === 'string' && v.trim())
                                      ?.trim() || '';
                                    const resolvedPath = citedPath
                                      || (label && folderPath ? `${folderPath}/documents/${label}` : '');
                                    const size = citation.file_size || citation.size;
                                    // Links carry no second line — it used to repeat the hostname,
                                    // which the label now shows on its own.
                                    const meta = isLink
                                      ? ''
                                      : [size ? formatBytes(size) : '', docTypeLabel(label)]
                                        .filter(Boolean)
                                        .join(' · ');
                                    const openDoc = () => {
                                      if (isLink) {
                                        const target = /^www\./i.test(linkUrl) ? `https://${linkUrl}` : linkUrl;
                                        window.electronAPI?.openExternal(target);
                                      } else if (resolvedPath) {
                                        window.electronAPI?.openDocumentReference?.(resolvedPath, citation.document_id, props.project?.id)
                                          ?.then((res: any) => {
                                            if (res && !res.success) console.warn('[Citation] Could not open', resolvedPath, res.error);
                                          });
                                      }
                                    };
                                    return (
                                      <div
                                        key={idx}
                                        className="group inline-flex items-center gap-2 px-2 py-1 rounded-md border border-sl-border-hover hover:border-sl-brand-primary hover:bg-sl-bg-surface-2 transition-colors cursor-pointer"
                                        title={isLink ? linkUrl : (resolvedPath || citation.document_id)}
                                        onClick={openDoc}
                                      >
                                        <div
                                          className="flex items-center justify-center w-6 h-6 rounded flex-shrink-0"
                                          style={{ background: 'var(--sl-brand-alpha-15)' }}
                                        >
                                          {isLink
                                            ? <LinkIcon sx={{ fontSize: 12, color: 'var(--sl-brand-primary)' }} />
                                            : <InsertDriveFileIcon sx={{ fontSize: 12, color: 'var(--sl-brand-primary)' }} />}
                                        </div>
                                        <div className="whitespace-nowrap leading-tight">
                                          <div className="text-[11px] font-semibold text-sl-text-secondary truncate" style={{ maxWidth: 200 }}>{displayLabel}</div>
                                          {meta && (
                                            <div className="text-[9px] text-sl-text-disabled uppercase tracking-wide truncate" style={{ maxWidth: 200 }}>{meta}</div>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-0.5 flex-shrink-0 ml-0.5">
                                          {isLink ? (
                                            <Tooltip title="Open in browser" arrow placement="top">
                                              <button
                                                className="flex items-center justify-center w-5 h-5 rounded text-sl-text-muted hover:text-sl-brand-primary transition-colors"
                                                onClick={(e) => { e.stopPropagation(); openDoc(); }}
                                              >
                                                <VisibilityOutlinedIcon sx={{ fontSize: 13 }} />
                                              </button>
                                            </Tooltip>
                                          ) : (
                                            <>
                                              <Tooltip title="Preview" arrow placement="top">
                                                <button
                                                  className="flex items-center justify-center w-5 h-5 rounded text-sl-text-muted hover:text-sl-brand-primary transition-colors"
                                                  onClick={(e) => { e.stopPropagation(); openDoc(); }}
                                                >
                                                  <VisibilityOutlinedIcon sx={{ fontSize: 13 }} />
                                                </button>
                                              </Tooltip>
                                              <Tooltip title="Download" arrow placement="top">
                                                <button
                                                  className="flex items-center justify-center w-5 h-5 rounded text-sl-text-muted hover:text-sl-brand-primary transition-colors"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (resolvedPath) window.electronAPI?.downloadDocument?.(resolvedPath);
                                                  }}
                                                >
                                                  <SaveAltIcon sx={{ fontSize: 13 }} />
                                                </button>
                                              </Tooltip>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                          {msg.content && !msg.is_new && (
                            <div className="flex items-center gap-1 mt-2 px-1">
                              <CopyToClipboard
                                text={msg.content}
                                onCopy={() => {
                                  setCopied(msg.id);
                                  setTimeout(() => setCopied(""), 1500);
                                }}>
                                <Tooltip title={copied === msg.id ? "Copied" : "Copy"} arrow placement="top">
                                  <button
                                    className="flex items-center justify-center w-7 h-7 rounded border transition-colors"
                                    style={{
                                      color: copied === msg.id ? 'var(--sl-status-success)' : 'var(--sl-text-muted)',
                                      borderColor: 'var(--sl-border-subtle)',
                                      background: 'transparent',
                                    }}
                                  >
                                    {copied === msg.id
                                      ? <CheckIcon sx={{ fontSize: 14 }} />
                                      : <ContentCopyIcon sx={{ fontSize: 14 }} />}
                                  </button>
                                </Tooltip>
                              </CopyToClipboard>
                              {/* Thumbs up */}
                              {(() => {
                                const feedbackId = msg.message_id || msg.id;
                                return (
                                  <>
                                    {/* Thumbs up */}
                                    <Tooltip title="Good response" arrow placement="top">
                                      <button
                                        className="flex items-center justify-center w-7 h-7 rounded border transition-colors"
                                        style={{
                                          color: feedback[feedbackId] === 'up' ? 'var(--sl-brand-primary)' : 'var(--sl-text-muted)',
                                          borderColor: feedback[feedbackId] === 'up' ? 'var(--sl-brand-primary)' : 'var(--sl-border-default, #374151)',
                                          background: 'transparent',
                                        }}
                                        onClick={async () => {
                                          const isActive = feedback[feedbackId] === 'up';
                                          if (isActive) {
                                            setFeedback(prev => { const s = { ...prev }; delete s[feedbackId]; return s; });
                                            try {
                                              const baseUrl = await getLocalApiEndpoint();
                                              const params = new URLSearchParams({
                                                session_id: currentConversationIdRef.current || '',
                                                message_id: feedbackId,
                                              });
                                              if (props.project?.id) params.set('project_id', props.project.id);
                                              await fetch(`${baseUrl}/v1/feedback?${params}`, { method: 'DELETE' });
                                            } catch { }
                                          } else {
                                            setFeedback(prev => ({ ...prev, [feedbackId]: 'up' }));
                                            try {
                                              const baseUrl = await getLocalApiEndpoint();
                                              await fetch(`${baseUrl}/v1/feedback`, {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({
                                                  session_id: currentConversationIdRef.current,
                                                  message_id: feedbackId,
                                                  ...(props.project?.id ? { project_id: props.project.id } : {}),
                                                  rating: 'up',
                                                }),
                                              });
                                            } catch { }
                                          }
                                        }}
                                      >
                                        <ThumbUpIcon sx={{ fontSize: 14 }} />
                                      </button>
                                    </Tooltip>
                                    {/* Thumbs down */}
                                    <Tooltip title="Bad response" arrow placement="top">
                                      <button
                                        className="flex items-center justify-center w-7 h-7 rounded border transition-colors"
                                        style={{
                                          color: feedback[feedbackId] === 'down' ? 'var(--sl-brand-primary)' : 'var(--sl-text-muted)',
                                          borderColor: feedback[feedbackId] === 'down' ? 'var(--sl-brand-primary)' : 'var(--sl-border-default, #374151)',
                                          background: 'transparent',
                                        }}
                                        onClick={async () => {
                                          console.log('[Chat] Thumbs down clicked, feedbackId:', feedbackId, 'current feedback:', feedback[feedbackId]);
                                          const isActive = feedback[feedbackId] === 'down';
                                          if (isActive) {
                                            setFeedback(prev => { const s = { ...prev }; delete s[feedbackId]; return s; });
                                            try {
                                              const baseUrl = await getLocalApiEndpoint();
                                              const params = new URLSearchParams({
                                                session_id: currentConversationIdRef.current || '',
                                                message_id: feedbackId,
                                              });
                                              if (props.project?.id) params.set('project_id', props.project.id);
                                              await fetch(`${baseUrl}/v1/feedback?${params}`, { method: 'DELETE' });
                                            } catch { }
                                          } else {
                                            setFeedback(prev => ({ ...prev, [feedbackId]: 'down' }));
                                            try {
                                              const baseUrl = await getLocalApiEndpoint();
                                              await fetch(`${baseUrl}/v1/feedback`, {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({
                                                  session_id: currentConversationIdRef.current,
                                                  message_id: feedbackId,
                                                  ...(props.project?.id ? { project_id: props.project.id } : {}),
                                                  rating: 'down',
                                                }),
                                              });
                                            } catch { }
                                          }
                                        }}
                                      >
                                        <ThumbDownIcon sx={{ fontSize: 14 }} />
                                      </button>
                                    </Tooltip>
                                  </>
                                );
                              })()}
                              {/* Save to project folder */}
                              <Tooltip title={saved === msg.id ? "Saved" : "Save"} arrow placement="top">
                                <span className="inline-flex">
                                  <button
                                    className="flex items-center justify-center w-7 h-7 rounded border transition-colors"
                                    disabled={saving === msg.id}
                                    style={{
                                      color: saved === msg.id ? 'var(--sl-status-success)' : 'var(--sl-text-muted)',
                                      borderColor: saved === msg.id ? 'var(--sl-status-success)' : 'var(--sl-border-default, #374151)',
                                      background: 'transparent',
                                      opacity: saving === msg.id ? 0.4 : 1,
                                      cursor: saving === msg.id ? 'not-allowed' : 'pointer',
                                    }}
                                    onClick={async () => {
                                      if (!window.electronAPI?.saveFileDialog) return;
                                      setSaving(msg.id);
                                      const folderPath = props.project?.folder_path;
                                      if (!folderPath) { setSaving(''); return; }
                                      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                                      const defaultName = `${timestamp}.md`;
                                      const result = await window.electronAPI.saveFileDialog(defaultName, msg.content, folderPath);
                                      setSaving('');
                                      if (result.success) {
                                        setSaved(msg.id);
                                        setTimeout(() => setSaved(''), 1500);
                                      }
                                    }}
                                  >
                                    {saving === msg.id
                                      ? <CircularProgress size={14} sx={{ color: 'var(--sl-text-muted)' }} />
                                      : saved === msg.id
                                        ? <CheckIcon sx={{ fontSize: 14 }} />
                                        : <SaveAltIcon sx={{ fontSize: 14 }} />}
                                  </button>
                                </span>
                              </Tooltip>
                            </div>
                          )}
                        </Box>
                      </Box>
                      : <Box className="flex justify-end">
                        <Box className="flex items-start gap-3 max-w-3xl">
                          <Box className="flex flex-col gap-2 flex-1">
                            {/* Attachments - shown above message if present */}
                            {msg.attachments && msg.attachments.filter((attachment: any) => attachment.file_id?.startsWith('file-')).length > 0 && (
                              <Box className="flex flex-wrap gap-2 mb-2 justify-end">
                                {msg.attachments
                                  .filter((attachment: any) => attachment.file_id?.startsWith('file-'))
                                  .map((attachment: any, idx: number) => {
                                    const previewSrc = isImageName(attachment.name)
                                      ? imagePreviews[attachment.file_id.replace(/^file-/, '')]
                                      : undefined;
                                    return previewSrc ? (
                                      <Box
                                        key={idx}
                                        className="p-1 bg-sl-bg-surface-2 rounded-[2px] border border-sl-border-default"
                                      >
                                        <img
                                          src={previewSrc}
                                          alt={attachment.name || 'Image attachment'}
                                          title={attachment.name}
                                          className="w-full max-w-[280px] h-auto rounded-[2px]"
                                        />
                                      </Box>
                                    ) : (
                                      <Box
                                        key={idx}
                                        className="flex items-center gap-2 px-2.5 py-1.5 text-xs bg-sl-bg-surface-2 rounded-sm border border-sl-border-default"
                                      >
                                        <Box
                                          sx={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            width: 24,
                                            height: 24,
                                            borderRadius: '50%',
                                            bgcolor: 'var(--sl-brand-alpha-15)',
                                          }}
                                        >
                                          <InsertDriveFileIcon sx={{ fontSize: 12, color: 'var(--sl-brand-primary)' }} />
                                        </Box>
                                        <span className="text-sl-text-tertiary truncate max-w-[150px]">{attachment.name || 'Document'}</span>
                                      </Box>
                                    );
                                  })}
                              </Box>
                            )}

                            {/* Message bubble */}
                            <div className="self-end max-w-full border border-sl-border-default rounded-lg px-3 md:px-5 py-2 md:py-3 text-sl-text-primary text-sm md:text-base leading-relaxed">
                              <pre className="user-message-content text-wrap break-words whitespace-pre-wrap font-[inherit]">
                                {renderUserMessageContent(msg.content)}
                              </pre>
                            </div>
                          </Box>
                        </Box>
                      </Box>
                    }

                  </React.Fragment>
                )
              })
              }
            </div>
          </div>
        </section>

        {/* The composer, and the two things an empty conversation floats off it.
            One stack, positioned two ways: absolutely anchored in the upper part
            of the column while the conversation is empty, back in flow at the
            bottom once it isn't. Anchored by its TOP — a growing composer used to
            be centred by a flex-grow spacer, so every wrapped line re-solved the
            1 : 2.2 split and moved the box's top edge up while its bottom edge
            went down. The caret drifted as you typed into it. Pinning the top
            means the box grows downward and only the openers below it move.

            Always this same node, in both placements: rendering it twice would
            remount it mid-conversation, dropping focus and any half-typed IME
            composition with it. */}
        <div
          // 34%, not true centre: the composer rests in the upper part of the
          // column so the openers hanging below it stay clear of the bottom edge,
          // and so a tall window doesn't read as slightly low.
          className={centerEmptyState ? 'absolute left-0 right-0 top-[34%]' : 'relative flex-none'}
        >
          {/* One quiet line over an empty conversation — the mark alone, no
              wordmark and no opening line. A sentence here is read once and then
              only takes up room, and the app doesn't need to spell its own name in
              its own window. The 26px headline that sat here first took a fifth of
              the view to say something you read once.

              Parked above the stack rather than inside it: out of flow, it can't
              be pushed around by the composer growing, and it fades in place on a
              send instead of having to collapse. `bottom: 100%` pins it to the
              stack's top edge — the edge that doesn't move. */}
          {/* Gone the moment the composer is, with no fade of its own. It's parked
              on the composer, so once that snaps to the bottom this is sitting just
              above a docked input — fading out from there flashed the mark at the
              foot of the window on its way out. `invisible`, not just transparent,
              so a docked composer doesn't carry an invisible mark over the
              transcript for find-in-page to land on. */}
          <div
            aria-hidden={!centerEmptyState}
            className={`absolute left-0 right-0 bottom-full flex justify-center pb-4 pointer-events-none ${centerEmptyState ? 'visible' : 'invisible'}`}
          >
            {/* Same surface as the composer below — its fill, its border, its
                radius — so the mark reads as the top of one object that the input
                box is the bottom of, rather than a badge floating over it. A bare
                glyph here looked like something that failed to load. Fills from
                `--sl-brand-mark`, so it survives a light theme (see logo.tsx). */}
            <div
              className="inline-flex items-center justify-center rounded-lg p-2"
              style={{ backgroundColor: 'var(--sl-white-alpha-5)', border: '1px solid var(--sl-border-subtle)' }}
            >
              <LogoMark className="h-7 md:h-8 w-auto" />
            </div>
          </div>

          <footer
            className={`relative flex flex-col gap-1 px-3 md:px-4 py-3 bg-sl-bg-base ${centerEmptyState ? '' : 'border-t border-sl-border-subtle'}`}
          >
            {/* Snapped, like the rest of the composer: a width easing out on its own
                while the box it belongs to has already jumped is the same mismatch,
                one axis over. */}
            <div className="w-full mx-auto" style={{ maxWidth: centerEmptyState ? 760 : '100%' }}>
              {composerBlock}
            </div>
          </footer>

          {/* Openers, parked under the stack on the same terms as the mark above
              it, so the centred empty view enters and leaves as one piece. Pinned
              to the stack's bottom edge, which is the edge a growing composer
              moves — so they slide down with it rather than being written over.
              With a panel open the Tips card in the body says this instead. */}
          <div
            aria-hidden={!centerEmptyState}
            className={`absolute left-0 right-0 top-full px-3 md:px-4 ${centerEmptyState ? 'visible' : 'invisible pointer-events-none'}`}
          >
            <div className="mx-auto flex flex-wrap justify-center gap-2 py-3" style={{ maxWidth: 760 }}>
              {EXAMPLE_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  disabled={!isServiceReady || !centerEmptyState}
                  tabIndex={centerEmptyState ? 0 : -1}
                  onClick={() => applyExamplePrompt(prompt)}
                  className="px-3 py-1.5 rounded-lg text-[12px] text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ border: '1px solid var(--sl-border-subtle)', color: 'var(--sl-text-muted)' }}
                  onMouseEnter={(e) => {
                    if (!isServiceReady) return;
                    e.currentTarget.style.borderColor = 'var(--sl-border-hover)';
                    e.currentTarget.style.color = 'var(--sl-text-secondary)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--sl-border-subtle)';
                    e.currentTarget.style.color = 'var(--sl-text-muted)';
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        </div>


      </Box>

      {selectionMenu && (
        <div
          className="selection-context-menu fixed z-50 flex flex-col min-w-[140px] py-1 rounded-md shadow-lg"
          style={{
            left: selectionMenu.x,
            top: selectionMenu.y,
            background: 'var(--sl-bg-surface-1)',
            border: '1px solid var(--sl-border-default)',
          }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <button
            className="flex items-center gap-2 px-3 py-1.5 text-[12px] text-sl-text-secondary hover:bg-sl-bg-surface-2 text-left"
            onClick={() => copyText(selectionMenu.text)}
          >
            <ContentCopyIcon sx={{ fontSize: 14 }} />
            Copy
          </button>
          <button
            className="flex items-center gap-2 px-3 py-1.5 text-[12px] text-sl-text-secondary hover:bg-sl-bg-surface-2 text-left"
            onClick={() => quoteText(selectionMenu.text)}
          >
            <FormatQuoteIcon sx={{ fontSize: 14 }} />
            Quote
          </button>
        </div>
      )}

    </>
  )
}
