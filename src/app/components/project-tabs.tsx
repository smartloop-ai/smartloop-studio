import { Box } from '@mui/material';

interface ProjectTabsProps {
  activeTab: number;
  onTabChange: (tabIndex: number) => void;
}

export default function ProjectTabs({ activeTab, onTabChange }: ProjectTabsProps) {
  const tabs = [
    { label: 'Chat', index: 0 },
    { label: 'Documents', index: 1 },
    { label: 'Configuration', index: 2 },
  ];

  return (
    <Box className="flex-none border-b border-gray-800 px-4 overflow-hidden">
      <Box className="flex items-end gap-[2px]">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.index;
          return (
            <button
              key={tab.index}
              onClick={() => onTabChange(tab.index)}
              className={`
                px-4 py-2 pb-[10px] cursor-pointer text-[13px]
                flex items-center gap-1.5 relative -mb-px
                transition-all duration-200
                ${isActive ? 'font-medium text-white bg-pink-500/10' : 'font-normal text-white/60 bg-transparent'}
                ${isActive ? 'border-l border-r border-b border-t border-pink-500/30' : 'border-l border-r border-b border-t border-white/10'}
                ${isActive ? 'border-b-pink-500/10' : ''}
                hover:text-white
                ${isActive ? 'hover:bg-pink-500/10' : 'hover:bg-white/5'}
              `}
            >
              {tab.label}
            </button>
          );
        })}
      </Box>
    </Box>
  );
}
