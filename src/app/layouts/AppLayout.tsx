import { useState, useEffect } from 'react';
import { Box } from '@mui/material';
import Sidebar from '@/app/components/sidebar';
import MobileNav from '@/app/components/mobile-nav';
import { useAuthContext } from '@/app/contexts/AuthContext';
import { storageService } from '@/app/services/storage.service';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [user] = useAuthContext();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [hasConversations, setHasConversations] = useState(false);

  // Check if any conversations exist in SQLite
  useEffect(() => {
    const checkConversations = async () => {
      const conversations = await storageService.getConversations();
      setHasConversations(conversations.length > 0);
    };

    checkConversations();

    // Re-check when conversations are created or deleted
    const handleChange = () => { checkConversations(); };
    window.addEventListener('conversationCreated', handleChange);
    window.addEventListener('conversationDeleted', handleChange);

    return () => {
      window.removeEventListener('conversationCreated', handleChange);
      window.removeEventListener('conversationDeleted', handleChange);
    };
  }, [user]);

  const showSidebar = hasConversations;

  return (
    <div className="wrapper">
      {showSidebar && (
        <Sidebar
          user={user}
          mobileOpen={mobileMenuOpen}
          onMobileClose={() => setMobileMenuOpen(false)}
        />
      )}
      <Box sx={{ marginLeft: { xs: 0, md: showSidebar ? '280px' : '0' } }}>
        {showSidebar && (
          <Box sx={{ display: { xs: 'block', md: 'none' } }}>
            <MobileNav onMenuClick={() => setMobileMenuOpen(true)} />
          </Box>
        )}
        {children}
      </Box>
    </div>
  );
}
