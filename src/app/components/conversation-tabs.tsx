import { Fragment, useState } from 'react';
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

// Reordering uses a private MIME type and deliberately does NOT set text/plain:
// the composer and the sidebar are both drop targets, and a tab carrying plain
// text would be droppable into them as content.
const TAB_MIME = 'application/x-sl-tab';

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
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const clearDrag = () => { setDragId(null); setDropIndex(null); };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (dragId && dropIndex !== null && onTabReorder) onTabReorder(dragId, dropIndex);
    clearDrag();
  };

  // A 2px rule spliced into the flex row rather than an absolutely positioned
  // overlay — the row does the measuring for us.
  const indicator = (
    <div
      key="drop-indicator"
      className="w-[2px] self-stretch my-1 rounded-full flex-none"
      style={{ backgroundColor: 'var(--sl-brand-primary)' }}
    />
  );

  return (
    <Box className="flex-none border-b border-sl-border-subtle px-4 overflow-hidden">
      <Box
        role="tablist"
        className="flex items-end gap-[2px] min-w-0"
        onDragOver={(e) => { if (dragId) e.preventDefault(); }}
        onDrop={handleDrop}
        onDragLeave={(e) => {
          // Only when the pointer actually leaves the strip, not when it crosses
          // between two tabs inside it.
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropIndex(null);
        }}
      >
        {tabs.map((tab, index) => {
          const isActive = activeTabId === tab.id;
          const tabActivity = activity?.[tab.id];

          return (
            // Keyed on the Fragment, not the div: the Fragment is what sits in
            // the array. Keying stably also matters for the drag itself —
            // Chromium cancels a drag whose source node gets replaced.
            <Fragment key={tab.id}>
              {dropIndex === index && indicator}
              <div
                role="tab"
                aria-selected={isActive}
                aria-busy={tabActivity === 'streaming' || tabActivity === 'queued'}
                draggable
                onDragStart={(e) => {
                  setDragId(tab.id);
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData(TAB_MIME, tab.id);
                }}
                onDragEnd={clearDrag}
                onDragOver={(e) => {
                  if (!dragId) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  const r = e.currentTarget.getBoundingClientRect();
                  setDropIndex(index + (e.clientX > r.left + r.width / 2 ? 1 : 0));
                }}
                onClick={() => onTabSelect(tab.id)}
                className={`
                  group px-4 py-2 pb-[10px] cursor-pointer text-[13px]
                  flex items-center gap-1.5 relative -mb-px
                  transition-all duration-200 min-w-0 max-w-[200px] flex-1
                  ${dragId === tab.id ? 'opacity-40' : ''}
                  ${isActive ? 'font-medium text-sl-text-primary' : 'font-normal text-sl-text-disabled bg-transparent'}
                  ${isActive ? 'border-l border-r border-b border-t' : 'border-l border-r border-b border-t border-sl-border-subtle'}
                  hover:text-sl-text-primary
                  ${isActive ? '' : 'hover:bg-sl-bg-surface-1'}
                `}
                style={isActive ? {
                  backgroundColor: 'var(--sl-brand-alpha-10)',
                  borderColor: 'var(--sl-brand-alpha-30)',
                  borderBottomColor: 'var(--sl-brand-alpha-10)',
                } : undefined}
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
                  onClick={(e) => {
                    e.stopPropagation();
                    onTabClose(tab.id);
                  }}
                  className="flex items-center flex-shrink-0"
                >
                  <CloseIcon className="text-[14px] opacity-0 group-hover:opacity-100 transition-all duration-150 cursor-pointer hover:text-red-500" />
                </span>
              </div>
            </Fragment>
          );
        })}
        {dropIndex === tabs.length && indicator}

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
