import { useState, useEffect } from 'react';
import { Box } from '@mui/material';
import Sidebar from '@/app/components/sidebar';
import MobileNav from '@/app/components/mobile-nav';
import { useAuthContext } from '@/app/contexts/AuthContext';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [user] = useAuthContext();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [hideSidebar, setHideSidebar] = useState(false);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setHideSidebar(document.body.hasAttribute('data-hide-sidebar'));
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-hide-sidebar'] });
    setHideSidebar(document.body.hasAttribute('data-hide-sidebar'));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="wrapper">
      {!hideSidebar && (
        <Sidebar
          user={user}
          mobileOpen={mobileMenuOpen}
          onMobileClose={() => setMobileMenuOpen(false)}
        />
      )}
      <Box sx={{ marginLeft: { xs: 0, md: hideSidebar ? 0 : '280px' } }}>
        {!hideSidebar && (
          <Box sx={{ display: { xs: 'block', md: 'none' } }}>
            <MobileNav onMenuClick={() => setMobileMenuOpen(true)} />
          </Box>
        )}
        {children}
      </Box>
    </div>
  );
}
