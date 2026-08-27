import { Dialog, Box, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { dialogStyles } from '@/app/shared/utils';

const IS_MAC = (window as any).electronAPI?.platform === 'darwin';
const MOD = IS_MAC ? '⌘' : 'Ctrl';
const SHIFT = IS_MAC ? '⇧' : 'Shift';
const ALT = IS_MAC ? '⌥' : 'Alt';

// Every binding the app registers, grouped the way the UI is laid out — by
// where the control lives, so a binding is findable from what you can see on
// screen. Handlers live in Home.tsx (tabs, conversations, web search),
// sidebar.tsx (search, settings), right-sidebar.tsx (panel sections) and
// model-picker.tsx (models) — keep this list in step with them.
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
    // Controls that live in the composer, not in a panel — the model dialog and
    // the web-search toggle both open from the row under the prompt.
    title: 'Composer',
    items: [
      { keys: `${MOD}+${SHIFT}+M`, label: 'Models' },
      { keys: `${MOD}+${ALT}+S`, label: 'Toggle web search' },
    ],
  },
  {
    title: 'Panels',
    items: [
      { keys: `${MOD}+K`, label: 'Search projects' },
      { keys: `${MOD}+B`, label: 'Toggle right panel' },
      { keys: `${MOD}+\\`, label: 'Collapse / expand the left sidebar' },
      { keys: `${MOD}+${SHIFT}+D / S / C / L`, label: 'Documents / Skills / Connections / Logs' },
      { keys: `${MOD}+${SHIFT}+,`, label: 'Project settings' },
      { keys: `${MOD}+,`, label: 'Settings' },
      { keys: `${MOD}+S`, label: 'Save skill (in editor)' },
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
      <Box className="p-5">
        <Box className="flex items-center justify-between mb-4">
          <h3 className="text-sl-text-primary text-sm font-semibold">Keybinds</h3>
          <IconButton size="small" onClick={onClose} sx={{ color: 'var(--sl-text-muted)' }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>

        <Box className="flex flex-col gap-4">
          {GROUPS.map((group) => (
            <Box key={group.title} className="flex flex-col gap-1">
              <div className="text-[10px] text-sl-text-disabled font-medium uppercase tracking-wider mb-1">
                {group.title}
              </div>
              {group.items.map((item) => (
                <Box key={item.keys + item.label} className="flex items-center justify-between gap-4 py-0.5">
                  <span className="text-[12px] text-sl-text-secondary">{item.label}</span>
                  <span
                    className="text-[11px] font-mono flex-shrink-0"
                    style={{ color: 'var(--sl-text-muted)' }}
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
