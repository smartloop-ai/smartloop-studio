
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
          color: 'white',
          padding: '8px',
          '&:hover': {
            color: '#ec4899',
          },
        }}
      >
        <MenuIcon />
      </IconButton>
    </Box>
  );
}
