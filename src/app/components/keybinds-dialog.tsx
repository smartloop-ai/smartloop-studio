import { Dialog, Box, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { dialogStyles } from '@/app/shared/utils';

const IS_MAC = (window as any).electronAPI?.platform === 'darwin';
const MOD = IS_MAC ? '⌘' : 'Ctrl';
const SHIFT = IS_MAC ? '⇧' : 'Shift';

// Every binding the app registers, grouped the way the UI is laid out. Handlers
// live in Home.tsx (tabs, conversations, web search), sidebar.tsx (search) and
// right-sidebar.tsx (panel sections) — keep this list in step with them.
const GROUPS: { title: string; items: { keys: string; label: string }[] }[] = [
  {
    title: 'Conversations',
    items: [
      { keys: `${MOD}+T`, label: 'New conversation' },
      { keys: `${MOD}+W`, label: 'Close tab' },
      { keys: `${MOD}+1…9`, label: 'Jump to tab' },
      { keys: `${MOD}+${SHIFT}+[  /  ]`, label: 'Previous / next tab' },
      { keys: 'Ctrl+Tab', label: 'Cycle conversations' },
      { keys: `Ctrl+${SHIFT}+Tab`, label: 'Cycle projects' },
      { keys: 'Esc', label: 'Interrupt response' },
    ],
  },
  {
    title: 'Panels',
    items: [
      { keys: `${MOD}+K`, label: 'Search projects' },
      { keys: `${MOD}+B`, label: 'Toggle right panel' },
      { keys: `${MOD}+${SHIFT}+1…5`, label: 'Models / Documents / MCP / Skills / Settings' },
      { keys: `${MOD}+${SHIFT}+S`, label: 'Toggle web search' },
      { keys: `${MOD}+S`, label: 'Save skill (in editor)' },
      { keys: '?', label: 'Show this list' },
    ],
  },
];

export default function KeybindsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: dialogStyles.paper }}
      BackdropProps={{ sx: dialogStyles.backdrop }}
    >
      <Box className="p-6">
        <Box className="flex items-center justify-between mb-5">
          <h3 className="text-sl-text-primary text-lg font-semibold">Keybinds</h3>
          <IconButton size="small" onClick={onClose} sx={{ color: 'var(--sl-text-muted)' }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>

        <Box className="flex flex-col gap-5">
          {GROUPS.map((group) => (
            <Box key={group.title} className="flex flex-col gap-2">
              <div className="text-[10px] text-sl-text-disabled font-medium uppercase tracking-wider">
                {group.title}
              </div>
              {group.items.map((item) => (
                <Box key={item.keys + item.label} className="flex items-center justify-between gap-4">
                  <span className="text-[12px] text-sl-text-secondary">{item.label}</span>
                  <span
                    className="text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase flex-shrink-0"
                    style={{
                      border: '1px solid var(--sl-border-default)',
                      color: 'var(--sl-text-muted)',
                    }}
                  >
                    {item.keys}
                  </span>
                </Box>
              ))}
            </Box>
          ))}
        </Box>
      </Box>
    </Dialog>
  );
}
