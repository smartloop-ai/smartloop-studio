
import { Box, IconButton } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';

interface MobileNavProps {
  onMenuClick: () => void;
}

export default function MobileNav({ onMenuClick }: MobileNavProps) {
  return (
    <Box
      sx={{
        display: { xs: 'flex', md: 'none' },
        mb: 3,
        alignItems: 'center',
      }}
    >
      <IconButton
        onClick={onMenuClick}
        sx={{
          color: 'var(--sl-text-primary)',
          padding: '8px',
          '&:hover': {
            color: 'var(--sl-brand-primary)',
          },
        }}
      >
        <MenuIcon />
      </IconButton>
    </Box>
  );
}
