import { useState, useEffect, useCallback } from 'react';
import { Box } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import Sidebar from '@/app/components/sidebar';
import { SIDEBAR_ANIM_MS } from '@/app/components/sidebar-motion';
import MobileNav from '@/app/components/mobile-nav';
import { useAuthContext } from '@/app/contexts/AuthContext';
import { storageService } from '@/app/services/storage.service';

// Width of the left sidebar, and of the rail it leaves behind when collapsed.
const SIDEBAR_WIDTH = '280px';
const SIDEBAR_RAIL = '48px';
const COLLAPSED_KEY = 'left_sidebar_collapsed';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [user] = useAuthContext();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // Owned here rather than in the sidebar: the content margin has to move with
  // it, and this is the component that holds both.
  //
  // Collapsed on a first launch, like the right panel — the app opens on the
  // conversation, not on its own furniture. Both rails stay visible, so the way
  // back is a click (or ⌘\) rather than something to discover.
  const [collapsed, setCollapsed] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    storageService.getItem(COLLAPSED_KEY).then((saved: any) => {
      // Only an explicit `false` expands it: anything else — never set, or a
      // stored `true` — leaves the first-launch default standing.
      if (!cancelled && saved === false) setCollapsed(false);
    });
    return () => { cancelled = true; };
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      storageService.setItem(COLLAPSED_KEY, !prev);
      return !prev;
    });
  }, []);

  // Cmd/Ctrl+\ collapses the left sidebar. Not Cmd+B — that already toggles the
  // right one here — and matched on e.code so the physical key works on any
  // layout.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      if (e.code !== 'Backslash') return;
      e.preventDefault();
      toggleCollapsed();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleCollapsed]);

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
    <div className="wrapper">
      <Sidebar
        user={user}
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
      />
      <Box sx={{ marginLeft: { xs: 0, md: collapsed ? SIDEBAR_RAIL : SIDEBAR_WIDTH }, transition: `margin-left ${SIDEBAR_ANIM_MS}ms ease` }}>
        <Box sx={{ display: { xs: 'block', md: 'none' } }}>
          <MobileNav onMenuClick={() => setMobileMenuOpen(true)} />
        </Box>
        {children}
      </Box>
    </div>
  );
}
