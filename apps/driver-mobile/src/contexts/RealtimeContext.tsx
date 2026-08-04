import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';

import {
  realtime,
  type OrderRealtimeEvent,
  type RealtimeConnectionState,
} from '@services/realtime';
import { useAuth } from './AuthContext';
import { useOnlineStatus } from './OnlineStatusContext';

interface RealtimeContextValue {
  /** Listen for order events. Returns an unsubscribe function. */
  subscribe: (listener: (event: OrderRealtimeEvent) => void) => () => void;
  connectionState: RealtimeConnectionState;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

/**
 * Owns the Pusher socket for the authenticated session.
 *
 * Must sit inside `OnlineStatusProvider`: the new-order broadcast channel is
 * attached and detached with the driver's shift, while the tenant channel —
 * which carries updates for jobs they already hold — stays up regardless.
 *
 * The socket is dropped when the app backgrounds rather than left open. A
 * websocket the OS has frozen keeps reporting "connected" while silently
 * dropping frames, so reconnecting on resume (and refetching off the resulting
 * `connected` transition) is more truthful than trusting a stale socket.
 */
export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { session, user } = useAuth();
  const { online, isRestoring } = useOnlineStatus();
  const [connectionState, setConnectionState] = useState<RealtimeConnectionState>(
    realtime.getState(),
  );

  const tenantId = user?.tenantId ?? null;

  // Read inside the AppState listener without re-registering it on every toggle.
  const shiftRef = useRef({ online, isRestoring });
  shiftRef.current = { online, isRestoring };

  useEffect(() => realtime.onState(setConnectionState), []);

  useEffect(() => {
    if (!session || !tenantId) return;

    // Read through the ref: the shift state seeds the initial subscription but
    // must not be a dependency, or going on/off shift would tear down the whole
    // connection instead of toggling the one channel (next effect).
    const shift = shiftRef.current;
    void realtime.connect(tenantId, shift.online && !shift.isRestoring);
    return () => realtime.disconnect();
  }, [session, tenantId]);

  useEffect(() => {
    if (!session || !tenantId || isRestoring) return;
    if (online) {
      realtime.subscribeBroadcast();
    } else {
      realtime.unsubscribeBroadcast();
    }
  }, [session, tenantId, online, isRestoring]);

  useEffect(() => {
    if (!session || !tenantId) return;

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        const shift = shiftRef.current;
        void realtime.connect(tenantId, shift.online && !shift.isRestoring);
      } else if (state === 'background') {
        realtime.disconnect();
      }
    });
    return () => subscription.remove();
  }, [session, tenantId]);

  const value = useMemo<RealtimeContextValue>(
    () => ({ subscribe: realtime.onEvent.bind(realtime), connectionState }),
    [connectionState],
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeContextValue {
  const context = useContext(RealtimeContext);
  if (!context) throw new Error('useRealtime must be used within a RealtimeProvider');
  return context;
}