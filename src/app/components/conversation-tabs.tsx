import { Box } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import AddBoxIcon from '@mui/icons-material/AddBox';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import ConstructionIcon from '@mui/icons-material/Construction';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import PowerOutlinedIcon from '@mui/icons-material/PowerOutlined';

export type TabType = 'conversation' | 'document' | 'skill' | 'mcp';

export interface OpenTab {
  id: string;
  type: TabType;
  title: string;
  data?: any;
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
}

export default function ContentTabs({
  tabs,
  activeTabId,
  onTabSelect,
  onTabClose,
  onNewConversation,
}: ContentTabsProps) {
  return (
    <Box className="flex-none border-b border-gray-800 px-4 overflow-hidden">
      <Box className="flex items-end gap-[2px] min-w-0">
        {tabs.map((tab) => {
          const isActive = activeTabId === tab.id;

          return (
            <div
              key={tab.id}
              onClick={() => onTabSelect(tab.id)}
              className={`
                group px-4 py-2 pb-[10px] cursor-pointer text-[13px]
                flex items-center gap-1.5 relative -mb-px
                transition-all duration-200 min-w-0 max-w-[200px] flex-1
                ${isActive ? 'font-medium text-white bg-pink-500/10' : 'font-normal text-white/60 bg-transparent'}
                ${isActive ? 'border-l border-r border-b border-t border-pink-500/30' : 'border-l border-r border-b border-t border-white/10'}
                ${isActive ? 'border-b-pink-500/10' : ''}
                hover:text-white
                ${isActive ? 'hover:bg-pink-500/10' : 'hover:bg-white/5'}
              `}
            >
              {TAB_ICONS[tab.type]}
              <span className="overflow-hidden text-ellipsis whitespace-nowrap flex-1">
                {tab.title}
              </span>
              <CloseIcon
                onClick={(e) => {
                  e.stopPropagation();
                  onTabClose(tab.id);
                }}
                className="text-[14px] opacity-0 group-hover:opacity-100 transition-all duration-150 cursor-pointer hover:text-red-500 flex-shrink-0"
              />
            </div>
          );
        })}

        {/* New Conversation Button (+) */}
        <button
          onClick={onNewConversation}
          className="flex-shrink-0 px-2 py-1.5 mb-1 ml-1 transition-colors text-gray-400 hover:text-pink-500 cursor-pointer"
          title="New conversation"
        >
          <AddBoxIcon className="text-[20px]" />
        </button>
      </Box>
    </Box>
  );
}
