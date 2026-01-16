import { Box } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import AddBoxIcon from '@mui/icons-material/AddBox';
import { useEffect, useState, useRef } from 'react';

interface ConversationTabsProps {
  projectConversations: any[];
  currentConversation: any;
  onConversationSelect: (conversationId: string) => void;
  onConversationDelete: (e: React.MouseEvent, conversationId: string) => void;
  onNewConversation: () => void;
}

export default function ConversationTabs({
  projectConversations,
  currentConversation,
  onConversationSelect,
  onConversationDelete,
  onNewConversation,
}: ConversationTabsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tabWidth, setTabWidth] = useState<number>(200);

  // Calculate dynamic tab width based on container size and number of tabs
  useEffect(() => {
    const calculateTabWidth = () => {
      if (!containerRef.current) return;

      const containerWidth = containerRef.current.offsetWidth;
      const buttonWidth = 60; // Approximate width for + button and margins
      const availableWidth = containerWidth - buttonWidth;
      const tabCount = projectConversations.length;

      if (tabCount === 0) {
        setTabWidth(200);
        return;
      }

      const calculatedWidth = availableWidth / tabCount;
      const maxWidth = 200;
      const minWidth = 80; // Lower minimum to accommodate more tabs

      // Always fit within available space, but respect maxWidth when possible
      if (calculatedWidth > maxWidth) {
        setTabWidth(maxWidth);
      } else {
        // Allow shrinking below minWidth if necessary to fit all tabs
        setTabWidth(Math.max(minWidth, calculatedWidth));
      }
    };

    calculateTabWidth();

    // Recalculate on window resize
    window.addEventListener('resize', calculateTabWidth);
    return () => window.removeEventListener('resize', calculateTabWidth);
  }, [projectConversations.length]);

  // Listen for conversation created events to refresh tab list
  useEffect(() => {
    const handleConversationCreated = () => {
      // Parent component will handle the actual refresh via user data update
      // This effect ensures the component re-renders when events fire
    };

    window.addEventListener('conversationCreated', handleConversationCreated);
    return () => window.removeEventListener('conversationCreated', handleConversationCreated);
  }, []);

  return (
    <Box ref={containerRef} className="flex-none border-b border-gray-800 px-2 overflow-hidden">
      <Box className="flex items-end gap-[2px]">
        {/* Conversation Tabs */}
        {projectConversations.map((conv: any) => {
          const isActive = currentConversation && currentConversation.id === conv.id;
          return (
            <div
              key={conv.id}
              onClick={() => onConversationSelect(conv.id)}
              style={{ width: `${tabWidth}px`, flexShrink: 0 }}
              className={`
                group px-4 py-2 pb-[10px] cursor-pointer text-[13px]
                flex items-center gap-1.5 relative -mb-px
                transition-all duration-200
                ${isActive ? 'font-medium text-white bg-pink-500/10' : 'font-normal text-white/60 bg-transparent'}
                ${isActive ? 'border-l border-r border-b border-t border-pink-500/30' : 'border-l border-r border-b border-t border-white/10'}
                ${isActive ? 'border-b-pink-500/10' : ''}
                hover:text-white
                ${isActive ? 'hover:bg-pink-500/10' : 'hover:bg-white/5'}
              `}
            >
              <span className="overflow-hidden text-ellipsis whitespace-nowrap flex-1">
                {conv.title || 'Untitled'}
              </span>
              <CloseIcon
                onClick={(e) => {
                  e.stopPropagation();
                  console.log('[ConversationTabs] Delete icon clicked for conversation:', conv.id);
                  onConversationDelete(e, conv.id);
                }}
                className="text-[14px] opacity-0 group-hover:opacity-100 transition-all duration-150 cursor-pointer hover:text-red-500 flex-shrink-0"
              />
            </div>
          );
        })}

        {/* New Conversation Button - right after last conversation */}
        <button
          onClick={onNewConversation}
          className="text-gray-400 px-2 py-1.5 mb-1 mr-5 hover:text-pink-500 transition-colors"
          title="New conversation"
        >
          <AddBoxIcon className="text-[20px]" />
        </button>
      </Box>
    </Box>
  );
}
