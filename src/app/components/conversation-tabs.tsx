import { useEffect, useRef, useState } from 'react';
import { Box } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import AddBoxIcon from '@mui/icons-material/AddBox';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import ConstructionIcon from '@mui/icons-material/Construction';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import PowerOutlinedIcon from '@mui/icons-material/PowerOutlined';
import { TabActivitySpinner } from '@/app/components/activity-spinner';
import type { ChatActivity } from '@/app/contexts/ChatSessionsContext';

export type TabType = 'conversation' | 'document' | 'skill' | 'mcp';

export interface OpenTab {
  id: string;
  type: TabType;
  title: string;
  data?: any;
}

const IS_MAC = (window as any).electronAPI?.platform === 'darwin';
const NEW_TAB_HOTKEY = IS_MAC ? '⌘T' : 'Ctrl+T';
const CLOSE_TAB_HOTKEY = IS_MAC ? '⌘W' : 'Ctrl+W';

// Pointer travel before a press becomes a drag, so a plain click still selects.
const DRAG_THRESHOLD_PX = 4;

// Tab geometry captured once when a drag starts, in viewport coordinates.
// Measuring once keeps the drop line steady while the dragged tab moves.
interface DragSession {
  id: string;
  pointerId: number;
  startX: number;
  started: boolean;
  index: number;
  minDx: number;
  maxDx: number;
  centerX: number;
  mids: number[];
  // Drop-line x for gap i (0..n), relative to the tablist.
  gaps: number[];
  dropIndex: number | null;
}

const TAB_ICONS: Record<TabType, React.ReactNode> = {
  conversation: <ChatBubbleOutlineIcon sx={{ fontSize: 14 }} />,
  document: <DescriptionOutlinedIcon sx={{ fontSize: 14 }} />,
  skill: <ConstructionIcon sx={{ fontSize: 14 }} />,
  mcp: <PowerOutlinedIcon sx={{ fontSize: 14 }} />,
};

interface ContentTabsProps {
  tabs: OpenTab[];
  activeTabId: string | null;
  onTabSelect: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onNewConversation: () => void;
  /** Keyed by tab id. Drives the throbber that replaces the type icon. */
  activity?: Record<string, ChatActivity>;
  onTabReorder?: (tabId: string, toIndex: number) => void;
}

export default function ContentTabs({
  tabs,
  activeTabId,
  onTabSelect,
  onTabClose,
  onNewConversation,
  activity,
  onTabReorder,
}: ContentTabsProps) {
  // Native drag-and-drop can't be bounded — the browser paints the drag image
  // wherever the cursor goes. Pointer events move the tab itself instead, so
  // its offset can be clamped to the strip and it never leaves the row.
  const [dragId, setDragId] = useState<string | null>(null);
  const [offsetX, setOffsetX] = useState(0);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const sessionRef = useRef<DragSession | null>(null);
  const suppressClickRef = useRef(false);
  const tablistRef = useRef<HTMLDivElement | null>(null);
  const tabEls = useRef(new Map<string, HTMLDivElement>());

  const endDrag = () => {
    const session = sessionRef.current;
    sessionRef.current = null;
    if (session?.started) {
      try { tabEls.current.get(session.id)?.releasePointerCapture(session.pointerId); } catch { /* already released */ }
    }
    setDragId(null);
    setOffsetX(0);
    setDropIndex(null);
  };

  // Escape cancels; the click that follows the release must not select.
  useEffect(() => {
    if (!dragId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      suppressClickRef.current = true;
      endDrag();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dragId]);

  // The dragged tab closing mid-drag (Cmd+W, a delete) ends the drag.
  useEffect(() => {
    const session = sessionRef.current;
    if (session && !tabs.some((t) => t.id === session.id)) endDrag();
  }, [tabs]);

  const beginDrag = (session: DragSession, el: HTMLDivElement) => {
    const list = tablistRef.current;
    const rects = tabs.map((t) => tabEls.current.get(t.id)?.getBoundingClientRect());
    if (!list || rects.some((r) => !r)) return false;
    const rs = rects as DOMRect[];
    const self = rs[session.index];
    const listLeft = list.getBoundingClientRect().left;
    const last = rs.length - 1;
    session.minDx = rs[0].left - self.left;
    session.maxDx = rs[last].right - self.right;
    session.centerX = self.left + self.width / 2;
    session.mids = rs.map((r) => r.left + r.width / 2);
    session.gaps = rs.map((r, i) => (i === 0 ? r.left : (rs[i - 1].right + r.left) / 2) - listLeft);
    session.gaps.push(rs[last].right - listLeft);
    session.started = true;
    el.setPointerCapture(session.pointerId);
    setDragId(session.id);
    return true;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const session = sessionRef.current;
    if (!session || e.pointerId !== session.pointerId) return;
    const dx = e.clientX - session.startX;
    if (!session.started) {
      if (Math.abs(dx) <= DRAG_THRESHOLD_PX || !beginDrag(session, e.currentTarget)) return;
    }
    const clamped = Math.min(session.maxDx, Math.max(session.minDx, dx));
    const center = session.centerX + clamped;
    // Gap index measured before removal, as handleTabReorder expects. The
    // dragged tab's own midpoint counts, so "back where it started" lands on
    // gap index or index+1 — both a no-op.
    const index = session.mids.filter((m) => m < center).length;
    session.dropIndex = index;
    setOffsetX(clamped);
    setDropIndex(index);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const session = sessionRef.current;
    if (!session || e.pointerId !== session.pointerId) return;
    if (session.started) {
      suppressClickRef.current = true;
      const to = session.dropIndex;
      if (to !== null && to !== session.index && to !== session.index + 1 && onTabReorder) {
        onTabReorder(session.id, to);
      }
    }
    endDrag();
  };

  const session = sessionRef.current;
  const showLine = !!session?.started && dropIndex !== null
    && dropIndex !== session.index && dropIndex !== session.index + 1;

  return (
    <Box className="flex-none border-b border-sl-border-subtle px-4 overflow-hidden">
      <Box
        ref={tablistRef}
        role="tablist"
        className="relative flex items-end gap-[2px] min-w-0"
      >
        {tabs.map((tab, index) => {
          const isActive = activeTabId === tab.id;
          const tabActivity = activity?.[tab.id];
          const isDragging = dragId === tab.id;

          return (
            <div
              key={tab.id}
              ref={(el) => {
                if (el) tabEls.current.set(tab.id, el);
                else tabEls.current.delete(tab.id);
              }}
              role="tab"
              aria-selected={isActive}
              aria-busy={tabActivity === 'streaming' || tabActivity === 'queued'}
              onPointerDown={(e) => {
                if (e.button !== 0 || !onTabReorder) return;
                suppressClickRef.current = false;
                sessionRef.current = {
                  id: tab.id, pointerId: e.pointerId, startX: e.clientX, started: false, index,
                  minDx: 0, maxDx: 0, centerX: 0, mids: [], gaps: [], dropIndex: null,
                };
              }}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={endDrag}
              onClick={() => {
                if (suppressClickRef.current) { suppressClickRef.current = false; return; }
                onTabSelect(tab.id);
              }}
              className={`
                group px-4 py-2 pb-[10px] text-[13px] select-none touch-none
                flex items-center gap-1.5 relative -mb-px
                min-w-0 max-w-[200px] flex-1
                ${isDragging ? 'z-10 cursor-grabbing' : 'cursor-pointer transition-all duration-200'}
                ${isActive ? 'font-medium text-sl-text-primary' : 'font-normal text-sl-text-disabled bg-transparent'}
                ${isActive ? 'border-l border-r border-b border-t' : 'border-l border-r border-b border-t border-sl-border-subtle'}
                hover:text-sl-text-primary
                ${isActive ? '' : 'hover:bg-sl-bg-surface-1'}
              `}
              style={{
                ...(isActive ? {
                  backgroundColor: 'var(--sl-brand-alpha-10)',
                  borderColor: 'var(--sl-brand-alpha-30)',
                  borderBottomColor: 'var(--sl-brand-alpha-10)',
                } : {}),
                // Opaque while it slides over its neighbours; the active tab
                // keeps its tint as a layer over the solid base.
                ...(isDragging ? {
                  transform: `translateX(${offsetX}px)`,
                  backgroundColor: 'var(--sl-bg-base)',
                  ...(isActive ? { backgroundImage: 'linear-gradient(var(--sl-brand-alpha-10), var(--sl-brand-alpha-10))' } : {}),
                } : {}),
              }}
            >
              {/* Fixed slot so swapping icon for throbber doesn't shift the title. */}
              <span className="flex-none w-[14px] h-[14px] flex items-center justify-center">
                {tabActivity ? <TabActivitySpinner state={tabActivity} /> : TAB_ICONS[tab.type]}
              </span>
              <span className="overflow-hidden text-ellipsis whitespace-nowrap flex-1">
                {tab.title}
              </span>
              {/* Wrapped in a span because SVG ignores the `title` attribute — the
                  browser only renders a tooltip for it on an HTML element. The
                  shortcut hint is shown on the active tab only, since Cmd/Ctrl+W
                  closes whichever tab is active, not the one under the cursor. */}
              <span
                title={isActive ? `Close  ${CLOSE_TAB_HOTKEY}` : 'Close'}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onTabClose(tab.id);
                }}
                className="flex items-center flex-shrink-0"
              >
                <CloseIcon className="text-[14px] opacity-0 group-hover:opacity-100 transition-all duration-150 cursor-pointer hover:text-red-500" />
              </span>
            </div>
          );
        })}
        {/* Absolute rather than spliced into the row: inserting it into the flex
            flow would shift the dragged tab under its own transform. */}
        {showLine && session && (
          <div
            className="absolute top-1 bottom-1 w-[2px] -ml-px rounded-full pointer-events-none"
            style={{ left: session.gaps[dropIndex!], backgroundColor: 'var(--sl-brand-primary)' }}
          />
        )}

        {/* New Conversation Button (+) */}
        <button
          onClick={onNewConversation}
          className="flex-shrink-0 px-2 py-1.5 mb-1 ml-1 transition-colors text-sl-text-muted cursor-pointer"
          style={{ ['--tw-hover-color' as any]: 'var(--sl-brand-primary)' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--sl-brand-primary)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '')}
          title={`New conversation  ${NEW_TAB_HOTKEY}`}
        >
          <AddBoxIcon className="text-[20px]" />
        </button>
      </Box>
    </Box>
  );
}
