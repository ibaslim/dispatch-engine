import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  login as apiLogin,
  logout as apiLogout,
  me as apiMe,
  type MeResponse,
} from '@services/api';
import { getAccessToken, clearTokens } from '@services/storage';
import { stopBackgroundTracking } from '@services/driver';

/** The authenticated driver's identity, surfaced to the UI. */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  /** The driver's tenant. Realtime channel names are derived from it. */
  tenantId: string | null;
  tenantRole: string | null;
}

interface AuthContextValue {
  /** The access token when signed in, else null. */
  session: string | null;
  /** Identity of the signed-in driver (null until hydrated / when signed out). */
  user: AuthUser | null;
  /** True until the persisted session has been checked (avoids redirect flicker). */
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Message shown when the api client gives up after a failed token refresh. */
const SESSION_EXPIRED = 'Session expired. Please log in again.';

/** True when the account carries the `driver` role (this app is driver-only). */
function isDriver(profile: MeResponse): boolean {
  return profile.roles.includes('driver') || profile.tenant_role === 'driver';
}

function toUser(profile: MeResponse): AuthUser {
  return {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    tenantId: profile.tenant_id,
    tenantRole: profile.tenant_role,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const signOut = useCallback(async () => {
    // Tracking outlives the React tree by design (so a killed app keeps
    // reporting), which means unmounting the authenticated stack no longer
    // stops it. Signing out ends the shift, so stop it explicitly — otherwise
    // the foreground service would keep posting for a logged-out driver.
    await stopBackgroundTracking();


    try {
      await apiLogout();
    } catch {
      // Best-effort server logout; clear local state regardless.
    }
    await clearTokens();
    setSession(null);
    setUser(null);
  }, []);

  // Restore a persisted session on launch, then hydrate identity in the
  // background. A stored token optimistically unlocks the app; we only sign out
  // if the server rejects it (expired) — a network blip keeps the session.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;
        if (active) setSession(token);
        try {
          const profile = await apiMe();
          if (!active) return;
          if (!isDriver(profile)) {
            await signOut();
            return;
          }
          setUser(toUser(profile));
        } catch (err) {
          const message = err instanceof Error ? err.message : '';
          if (message === SESSION_EXPIRED) {
            await signOut();
          }
          // Otherwise (offline/server down): keep the optimistic session.
        }
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [signOut]);

  const signIn = useCallback(async (email: string, password: string) => {
    // The api client persists tokens via SecureTokenStorage on success — even
    // for the status responses below, which still carry a token pair.
    const result = await apiLogin(email, password);

    // Accounts that exist but can't sign in yet come back 200 with a `status`.
    if (result.status === 'pending' || result.status === 'pre_pending') {
      await clearTokens();
      throw new Error(
        result.message ??
          'Your account is awaiting approval. Your dispatcher will activate it soon.'
      );
    }
    if (result.status === 'suspended') {
      await clearTokens();
      throw new Error(
        result.message ?? 'Your account is suspended. Please contact your dispatcher.'
      );
    }

    // Confirm this is a driver before letting them in.
    const profile = await apiMe();
    if (!isDriver(profile)) {
      await clearTokens();
      throw new Error(
        'This app is for drivers. Use the web portal to sign in for your role.'
      );
    }

    setSession(result.access_token);
    setUser(toUser(profile));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ session, user, isLoading, signIn, signOut }),
    [session, user, isLoading, signIn, signOut]
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
