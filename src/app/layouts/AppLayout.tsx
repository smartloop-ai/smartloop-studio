import { useState, useEffect } from 'react';
import { Box } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import Sidebar from '@/app/components/sidebar';
import MobileNav from '@/app/components/mobile-nav';
import { useAuthContext } from '@/app/contexts/AuthContext';
import { AppStatusProvider } from '@/app/contexts/AppStatusContext';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [user] = useAuthContext();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api?.onNavigateToProject) return;

    api.onNavigateToProject((projectId: string) => {
      navigate(`/?project=${projectId}`);
    });

    return () => {
      api.removeNavigateToProjectListener?.();
    };
  }, [navigate]);

  return (
    <AppStatusProvider>
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
    </AppStatusProvider>
  );
}
