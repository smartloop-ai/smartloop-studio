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

// How long neighbours take to slide aside, and the dropped tab to settle.
const SLIDE_MS = 150;
const SLIDE_CLASS = 'transition-transform duration-150 ease-out';

// Tab geometry captured once when a drag starts, in viewport coordinates.
// Measuring once means the neighbours' own sliding never feeds back into
// where the dragged tab is judged to be.
interface DragSession {
  id: string;
  pointerId: number;
  startX: number;
  started: boolean;
  index: number;
  minDx: number;
  maxDx: number;
  // The dragged tab's edges at rest.
  left: number;
  right: number;
  // Left edge of every slot, for settling the dropped tab into its new one.
  slotLefts: number[];
  // Midpoints of the other tabs, in order, to pick the target slot.
  otherMids: number[];
  // How far a neighbour slides to make room: one tab plus the row gap.
  shift: number;
  target: number;
  // Latest clamped offset; state can lag the final pointermove by a render.
  offset: number;
}

// After a drop: the tab starts at `x` (where it was released, relative to its
// new slot) and animates to 0 once `run` flips on the next frame.
interface Settle {
  id: string;
  x: number;
  run: boolean;
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
  // Chrome-style: the neighbours slide aside to open the slot the tab will
  // land in, so the result is visible before release.
  const [dragId, setDragId] = useState<string | null>(null);
  const [offsetX, setOffsetX] = useState(0);
  const [target, setTarget] = useState<number | null>(null);
  const [settle, setSettle] = useState<Settle | null>(null);
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
    setTarget(null);
  };

  // Two frames so the start position is painted before the transition runs.
  useEffect(() => {
    if (!settle) return;
    if (!settle.run) {
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setSettle((s) => (s ? { ...s, run: true } : s)));
      });
      return () => { cancelAnimationFrame(outer); cancelAnimationFrame(inner); };
    }
    const done = setTimeout(() => setSettle(null), SLIDE_MS + 30);
    return () => clearTimeout(done);
  }, [settle]);

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
    const rects = tabs.map((t) => tabEls.current.get(t.id)?.getBoundingClientRect());
    if (rects.some((r) => !r)) return false;
    const rs = rects as DOMRect[];
    const self = rs[session.index];
    const last = rs.length - 1;
    session.minDx = rs[0].left - self.left;
    session.maxDx = rs[last].right - self.right;
    session.left = self.left;
    session.right = self.right;
    session.slotLefts = rs.map((r) => r.left);
    session.otherMids = rs.filter((_, i) => i !== session.index).map((r) => r.left + r.width / 2);
    session.shift = self.width + (rs.length > 1 ? rs[1].left - rs[0].right : 0);
    session.target = session.index;
    session.started = true;
    setSettle(null);
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
    // A neighbour is passed once the dragged tab's leading edge crosses its
    // midpoint. Edges, not the centre: at a clamp limit the centre sits exactly
    // on the end tab's midpoint, and a strict comparison never took the last
    // slot. The edges are past it at both limits.
    const from = session.index;
    const before = session.otherMids.slice(0, from);
    const after = session.otherMids.slice(from);
    const slot = from
      - before.filter((m) => m >= session.left + clamped).length
      + after.filter((m) => m <= session.right + clamped).length;
    session.target = slot;
    session.offset = clamped;
    setOffsetX(clamped);
    setTarget(slot);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const session = sessionRef.current;
    if (!session || e.pointerId !== session.pointerId) return;
    if (session.started) {
      suppressClickRef.current = true;
      const { index: from, target: to } = session;
      // handleTabReorder takes a gap index measured before removal.
      if (to !== from && onTabReorder) onTabReorder(session.id, to > from ? to + 1 : to);
      // Batched with the reorder: the tab starts where it was released and
      // glides into its new slot, while the neighbours land without animating.
      const releasedLeft = session.slotLefts[from] + session.offset;
      setSettle({ id: session.id, x: releasedLeft - session.slotLefts[to], run: false });
    }
    endDrag();
  };

  // How far a neighbour moves while a drag is in progress.
  const shiftFor = (index: number) => {
    const session = sessionRef.current;
    if (!session?.started || target === null) return 0;
    const from = session.index;
    if (from < index && index <= target) return -session.shift;
    if (target <= index && index < from) return session.shift;
    return 0;
  };

  return (
    <Box className="flex-none border-b border-sl-border-subtle px-4 overflow-hidden">
      <Box
        ref={tablistRef}
        role="tablist"
        className="flex items-end gap-[2px] min-w-0"
      >
        {tabs.map((tab, index) => {
          const isActive = activeTabId === tab.id;
          const tabActivity = activity?.[tab.id];
          const isDragging = dragId === tab.id;
          const isSettling = settle?.id === tab.id;
          // Transform for this render and whether it animates. Neighbours
          // slide during a drag; on the drop frame nothing animates except the
          // dropped tab's settle, or they'd glide back from their old offsets.
          let translate = 0;
          let motion = 'transition-all duration-200';
          if (isDragging) {
            translate = offsetX;
            motion = '';
          } else if (dragId) {
            translate = shiftFor(index);
            motion = SLIDE_CLASS;
          } else if (isSettling) {
            translate = settle.run ? 0 : settle.x;
            motion = settle.run ? SLIDE_CLASS : '';
          } else if (settle && !settle.run) {
            motion = '';
          }

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
                  minDx: 0, maxDx: 0, left: 0, right: 0, slotLefts: [], otherMids: [], shift: 0, target: index, offset: 0,
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
                ${isDragging ? 'z-10 cursor-grabbing' : 'cursor-pointer'}
                ${isSettling ? 'z-10' : ''}
                ${motion}
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
                ...(translate ? { transform: `translateX(${translate}px)` } : {}),
                // Opaque while it slides over its neighbours; the active tab
                // keeps its tint as a layer over the solid base.
                ...(isDragging || isSettling ? {
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
