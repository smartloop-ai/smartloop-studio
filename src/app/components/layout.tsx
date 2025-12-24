import { useState } from 'react';
import { Box } from '@mui/material';
import Sidebar from './sidebar';
import MobileNav from './mobile-nav';
import { useAuth } from '@/app/hooks/useAuth';

interface LayoutProps {
  children: React.ReactNode;
  showMobileNav?: boolean;
}

export default function Layout({ children, showMobileNav = true }: LayoutProps) {
  const [user] = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden', bgcolor: '#000' }}>
      {/* Sidebar - Persistent across all pages */}
      <Sidebar
        user={user}
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />

      {/* Main Content Area */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          height: '100vh',
          overflow: 'auto',
          marginLeft: { xs: 0, md: '280px' },
          bgcolor: '#000',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Mobile Navigation Header - Only show if prop is true */}
        {showMobileNav && (
          <Box sx={{ display: { xs: 'block', md: 'none' }, flexShrink: 0 }}>
            <MobileNav onMenuClick={() => setMobileMenuOpen(true)} />
          </Box>
        )}

        {/* Page Content - Flex 1 to take remaining space */}
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}

