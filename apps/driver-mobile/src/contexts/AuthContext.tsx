import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { login as apiLogin, logout as apiLogout } from '@services/api';
import { getAccessToken, clearTokens } from '@services/storage';

/**
 * DEV: render the authenticated app without a running backend. The provider
 * seeds a placeholder session so the `(app)` group is reachable. Set to `false`
 * to restore the real login gate (requires the API to be up).
 */
const DEV_BYPASS_AUTH = true;

interface AuthContextValue {
  /** Non-null when signed in (the access token, or a dev placeholder). */
  session: string | null;
  /** True until the persisted session has been checked (avoids redirect flicker). */
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      if (DEV_BYPASS_AUTH) {
        if (active) {
          setSession('dev-bypass');
          setIsLoading(false);
        }
        return;
      }
      try {
        const token = await getAccessToken();
        if (active) setSession(token);
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    // The api client persists tokens via SecureTokenStorage on success.
    await apiLogin(email, password);
    const token = await getAccessToken();
    setSession(token);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await apiLogout();
    } catch {
      // Best-effort server logout; clear local tokens regardless.
    }
    await clearTokens();
    setSession(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ session, isLoading, signIn, signOut }),
    [session, isLoading, signIn, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
