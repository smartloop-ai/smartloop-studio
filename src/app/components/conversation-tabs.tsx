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
  // Left edge and width of every slot, for settling the dropped tab into its
  // new one. Pills are content-sized, so the slots are not interchangeable.
  slotLefts: number[];
  slotWidths: number[];
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
  /**
   * The project's colour (see getProjectColor). Every open tab belongs to the
   * selected project, so one accent tints the whole strip: the active pill's
   * fill and ring, and the type icon on every pill. Any CSS colour works —
   * the palette mixes hex-with-alpha and theme variables — because the tints
   * are made with color-mix rather than by editing the value.
   */
  accentColor?: string;
}

export default function ContentTabs({
  tabs,
  activeTabId,
  onTabSelect,
  onTabClose,
  onNewConversation,
  activity,
  onTabReorder,
  accentColor = 'var(--sl-brand-primary)',
}: ContentTabsProps) {
  const tint = (pct: number) => `color-mix(in srgb, ${accentColor} ${pct}%, transparent)`;
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
    session.slotWidths = rs.map((r) => r.width);
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
      // Moving right, the tab lands after a neighbour that itself slid left
      // by the dragged width, so its new left edge is that neighbour's old
      // right edge less the width difference; moving left it takes the slot's
      // own left edge.
      const newLeft = to > from
        ? session.slotLefts[to] + session.slotWidths[to] - session.slotWidths[from]
        : session.slotLefts[to];
      setSettle({ id: session.id, x: releasedLeft - newLeft, run: false });
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
    <Box className="flex-none border-b border-sl-border-subtle px-3 h-12 flex items-center overflow-hidden">
      <Box
        ref={tablistRef}
        role="tablist"
        className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden"
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
                  minDx: 0, maxDx: 0, left: 0, right: 0, slotLefts: [], slotWidths: [], otherMids: [], shift: 0, target: index, offset: 0,
                };
              }}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={endDrag}
              onClick={() => {
                if (suppressClickRef.current) { suppressClickRef.current = false; return; }
                onTabSelect(tab.id);
              }}
              title={tab.title}
              // A pill, as in Firefox's tab strip: content-sized so the whole
              // title reads, lightly rounded like the app's other controls,
              // and floating in the row rather than
              // joined to the content below. When the row fills up the pills
              // shrink rather than scroll, and not evenly: the oldest tabs
              // give up width first (see flexShrink below), so the newest
              // ones, which are the ones in use, keep their full titles.
              // Shrunk far enough a pill is just its icon.
              className={`
                group h-[30px] px-3 text-[13px] select-none touch-none
                flex items-center gap-1.5 relative min-w-0 max-w-[320px]
                rounded-sm border
                ${isDragging ? 'z-10 cursor-grabbing' : 'cursor-pointer'}
                ${isSettling ? 'z-10' : ''}
                ${motion}
                ${isActive
                  ? 'font-medium text-sl-text-primary'
                  : 'font-normal text-sl-text-muted border-sl-border hover:text-sl-text-primary hover:bg-sl-bg-surface-1 hover:border-sl-border-hover'}
              `}
              style={{
                // The active tab never shrinks: it is the one being read. The
                // rest shrink in proportion to their age, the first tab the
                // most and the last one least, so the row collapses from the
                // left like a stack of older, less-needed tabs.
                flexShrink: isActive ? 0 : tabs.length - index,
                // Unselected pills keep the theme's quiet outline (the class
                // above); the selected one takes the project's colour instead.
                ...(isActive ? { backgroundColor: tint(18), borderColor: tint(45) } : {}),
                ...(translate ? { transform: `translateX(${translate}px)` } : {}),
                // Opaque while it slides over its neighbours; the active tab
                // keeps its tint as a layer over the solid base.
                ...(isDragging || isSettling ? {
                  backgroundColor: 'var(--sl-bg-base)',
                  ...(isActive ? { backgroundImage: `linear-gradient(${tint(18)}, ${tint(18)})` } : {}),
                } : {}),
              }}
            >
              {/* Fixed slot so swapping icon for throbber doesn't shift the title. */}
              <span
                className="flex-none w-[14px] h-[14px] flex items-center justify-center"
                // The project's colour on every pill, strongest on the active one.
                style={{ color: accentColor, opacity: isActive ? 1 : 0.7 }}
              >
                {tabActivity ? <TabActivitySpinner state={tabActivity} /> : TAB_ICONS[tab.type]}
              </span>
              <span className="overflow-hidden text-ellipsis whitespace-nowrap min-w-0">
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
          className="flex-shrink-0 flex items-center px-1.5 ml-0.5 transition-colors text-sl-text-muted cursor-pointer"
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
