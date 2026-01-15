import { createContext, useContext } from 'react';

interface AuthContextType {
  user: any;
  setUser: (user: any) => void;
}

export const AuthContext = createContext<AuthContextType | null>(null);

/**
 * Hook to access auth context from child components.
 * Use this instead of useAuth() in page components to avoid duplicate auth checks.
 */
export function useAuthContext(): [any, (user: any) => void] {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within an AuthContext.Provider');
  }
  return [context.user, context.setUser];
}
