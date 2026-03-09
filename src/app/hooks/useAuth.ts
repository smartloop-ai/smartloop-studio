import { useEffect, useState, useRef } from 'react';
import { projectService } from '@/app/services/project.service';

/**
 * Custom hook for local-only authentication
 * Loads projects from local SLP service — no remote login required
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
        setUser({ name: 'Local', guest: true, projects, conversations: [] });
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
        setUser(event.detail);
      }
    };

    window.addEventListener('userUpdated', handleUserUpdated as EventListener);

    // When SLP service comes online, refresh projects in user state
    const handleSlpReady = async () => {
      try {
        const projects = await projectService.getProjects();
        if (projects.length > 0) {
          setUser((prev: any) => prev ? { ...prev, projects } : prev);
        }
      } catch {}
    };
    window.addEventListener('slpServiceReady', handleSlpReady);

    return () => {
      window.removeEventListener('userUpdated', handleUserUpdated as EventListener);
      window.removeEventListener('slpServiceReady', handleSlpReady);
    };
  }, []);

  return [user, setUser, authReady];
}
