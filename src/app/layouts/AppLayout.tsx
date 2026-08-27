import { useState, useEffect, useCallback } from 'react';
import { Box } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import Sidebar from '@/app/components/sidebar';
import { SIDEBAR_ANIM_MS } from '@/app/components/sidebar-motion';
import MobileNav from '@/app/components/mobile-nav';
import { useAuthContext } from '@/app/contexts/AuthContext';
import { PanelProvider } from '@/app/contexts/PanelContext';
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
  // Expanded on a first launch, unlike the right panel — the two rails do
  // different jobs. This one is navigation: the projects, the conversation list,
  // the way to a new chat. Collapsed, it leaves a rail holding nothing but its own
  // expand button, so starting closed didn't save space so much as hide the way
  // around. The right rail keeps its section icons when it collapses, which is why
  // that one can default shut.
  const [collapsed, setCollapsed] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    storageService.getItem(COLLAPSED_KEY).then((saved: any) => {
      // Only an explicit `true` collapses it: anything else — never set, or a
      // stored `false` — leaves the first-launch default standing. Checked against
      // `true` rather than for truthiness so that "collapsed on purpose" and "never
      // touched" stay distinguishable, the same way the right sidebar stores its
      // own closed state explicitly.
      if (!cancelled && saved === true) setCollapsed(true);
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
    <PanelProvider leftOpen={!collapsed}>
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
    </PanelProvider>
  );
}
