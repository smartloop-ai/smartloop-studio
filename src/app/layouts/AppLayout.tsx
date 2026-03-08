import { useState } from 'react';
import { Box } from '@mui/material';
import Sidebar from '@/app/components/sidebar';
import MobileNav from '@/app/components/mobile-nav';
import { useAuthContext } from '@/app/contexts/AuthContext';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [user] = useAuthContext();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="wrapper">
      <Sidebar
        user={user}
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />
      <Box sx={{ marginLeft: { xs: 0, md: '280px' } }}>
        <Box sx={{ display: { xs: 'block', md: 'none' } }}>
          <MobileNav onMenuClick={() => setMobileMenuOpen(true)} />
        </Box>
        {children}
      </Box>
    </div>
  );
}
