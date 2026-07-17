import { useEffect, useState, useRef } from 'react';

/**
 * Custom hook for local-only authentication.
 * Checks auth status from the local SLP service. Projects are owned by
 * ProjectContext, not this hook — the user object no longer carries `projects`.
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
          // Fetch full profile (includes is_paid) before setting user to avoid flash
          let profile = authUser;
          if (window.electronAPI?.slpFetchUser) {
            try {
              const result = await window.electronAPI.slpFetchUser();
              if (result?.success && result.user) {
                profile = { ...authUser, ...result.user };
              }
            } catch (err) {
              console.warn('useAuth: Could not fetch user profile:', err);
            }
          }
          setUser({ ...profile, guest: false, conversations: [] });
        } else {
          setUser({ name: 'Local', guest: true, conversations: [] });
        }
      } catch (error) {
        console.error('useAuth: Error during init:', error);
        setUser({ name: 'Local', guest: true, conversations: [] });
      } finally {
        isAuthCheckingRef.current = false;
        setAuthReady(true);
      }
    };

    init();
  }, []);

  // Listen for userUpdated events
  useEffect(() => {
    const handleUserUpdated = (event: CustomEvent) => {
      if (event.detail) {
        setUser({ ...event.detail, guest: false });
      }
    };

    const handleAuthStateChanged = (event: CustomEvent) => {
      const { loggedIn, user: authUser } = event.detail || {};
      if (loggedIn && authUser) {
        setUser((prev: any) => prev ? { ...prev, ...authUser, guest: false } : { ...authUser, guest: false, conversations: [] });
      } else {
        setUser((prev: any) => prev ? { ...prev, email: undefined, guest: true } : prev);
      }
      // Model gating depends on login state; force an immediate health poll so
      // the UI (e.g. Settings memory widget) reflects the change promptly.
      (window as any).electronAPI?.pokeHealth?.();
    };

    window.addEventListener('userUpdated', handleUserUpdated as EventListener);
    window.addEventListener('authStateChanged', handleAuthStateChanged as EventListener);

    // Listen for user profile updates broadcast from main process
    const handleProfileUpdated = (event: CustomEvent) => {
      if (event.detail) {
        setUser((prev: any) => prev ? { ...prev, ...event.detail, guest: false } : prev);
      }
    };
    window.addEventListener('userProfileUpdated', handleProfileUpdated as EventListener);

    return () => {
      window.removeEventListener('userUpdated', handleUserUpdated as EventListener);
      window.removeEventListener('authStateChanged', handleAuthStateChanged as EventListener);
      window.removeEventListener('userProfileUpdated', handleProfileUpdated as EventListener);
    };
  }, []);

  return [user, setUser, authReady];
}
