import { useEffect, useState, useRef } from 'react';
import { projectService } from '@/app/services/project.service';
import { userService } from '@/app/services/user.service';

/**
 * Custom hook for local-only authentication
 * Checks auth status from local SLP service and loads projects
 * @returns [user, setUser, authReady] tuple
 */
export function useAuth(): [any, (user: any) => void, boolean] {
  const [user, setUser] = useState<any>(null);
  const [authReady, setAuthReady] = useState(false);
  const isAuthCheckingRef = useRef(false);

  useEffect(() => {
    if (isAuthCheckingRef.current) return;
    isAuthCheckingRef.current = true;

    const init = async () => {
      try {
        let projects: any[] = [];
        try {
          const localProjects = await projectService.getProjects();
          projects = Array.isArray(localProjects) ? localProjects : [];
        } catch (err) {
          console.warn('useAuth: Could not load local projects:', err);
        }

        console.log(`useAuth: Loaded ${projects.length} project(s) from local SLP`);

        // Check auth status from local service
        let authUser: any = null;
        try {
          if (window.electronAPI?.slpAuthStatus) {
            const status = await window.electronAPI.slpAuthStatus();
            if (status?.success && status?.has_access_token && status?.user) {
              authUser = status.user;
            }
          }
        } catch {}

        if (authUser) {
          setUser({ ...authUser, guest: false, projects, conversations: [] });
          // Fetch full user profile (includes is_paid) from /users/me
          userService.fetchAndStoreUser().then((profile) => {
            if (profile) {
              setUser((prev: any) => prev ? { ...prev, ...profile, guest: false } : prev);
            }
          }).catch((err) => {
            console.warn('useAuth: Could not fetch user profile:', err);
          });
        } else {
          setUser({ name: 'Local', guest: true, projects, conversations: [] });
        }
      } catch (error) {
        console.error('useAuth: Error during init:', error);
        setUser({ name: 'Local', guest: true, projects: [], conversations: [] });
      } finally {
        isAuthCheckingRef.current = false;
        setAuthReady(true);
      }
    };

    init();
  }, []);

  // Listen for userUpdated events (e.g., when a project is created)
  useEffect(() => {
    const handleUserUpdated = (event: CustomEvent) => {
      if (event.detail) {
        setUser({ ...event.detail, guest: false });
      }
    };

    const handleAuthStateChanged = (event: CustomEvent) => {
      const { loggedIn, user: authUser } = event.detail || {};
      if (loggedIn && authUser) {
        setUser((prev: any) => prev ? { ...prev, ...authUser, guest: false } : { ...authUser, guest: false, projects: [], conversations: [] });
      } else {
        setUser((prev: any) => prev ? { ...prev, email: undefined, guest: true } : prev);
      }
    };

    window.addEventListener('userUpdated', handleUserUpdated as EventListener);
    window.addEventListener('authStateChanged', handleAuthStateChanged as EventListener);

    // When SLP service comes online, refresh projects
    const handleSlpReady = async () => {
      try {
        let projects = await projectService.getProjects();

        // Auto-create a system project if none exist
        if (projects.length === 0) {
          const result = await projectService.createProject({
            name: 'General',
            system: true,
          });
          if (result.success && result.data) {
            projects = [result.data];
            console.log('useAuth: Auto-created system project:', result.data.id);
          }
        }

        if (projects.length > 0) {
          setUser((prev: any) => prev ? { ...prev, projects } : prev);
        }
      } catch {}
    };
    window.addEventListener('slpServiceReady', handleSlpReady);

    return () => {
      window.removeEventListener('userUpdated', handleUserUpdated as EventListener);
      window.removeEventListener('authStateChanged', handleAuthStateChanged as EventListener);
      window.removeEventListener('slpServiceReady', handleSlpReady);
    };
  }, []);

  return [user, setUser, authReady];
}
