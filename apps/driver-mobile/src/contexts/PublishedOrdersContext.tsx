import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { isApiError } from '@dispatch/shared/api-client';
import { acceptOrder, getPublishedOrders } from '@services/orders';
import type { DriverOrder } from '@types';
import { useAuth } from './AuthContext';
import { useOnlineStatus } from './OnlineStatusContext';
import { useOrders } from './OrdersContext';
import { useRealtime } from './RealtimeContext';

const SESSION_EXPIRED = 'Session expired. Please log in again.';

/** Mirrors the API's `PUBLISH_WINDOW_MINUTES`; the server enforces it too. */
export const PUBLISH_WINDOW_SECONDS = 15 * 60;

/** A broadcast order plus its live countdown. */
export interface PublishedOrder extends DriverOrder {
  remainingSeconds: number;
}

export type AcceptOutcome =
  | { result: 'accepted'; order: DriverOrder }
  /** Another driver won the race (409). */
  | { result: 'taken'; message: string }
  /** The 15-minute broadcast window closed (410). */
  | { result: 'expired'; message: string }
  | { result: 'failed'; message: string };

interface PublishedOrdersContextValue {
  /** Live offers, newest first. Always empty while offline. */
  available: PublishedOrder[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  accept: (orderId: string) => Promise<AcceptOutcome>;
}

const PublishedOrdersContext = createContext<PublishedOrdersContextValue | null>(null);

function secondsLeft(order: DriverOrder, now: number): number {
  if (!order.published_at) return 0;
  const publishedAt = new Date(order.published_at).getTime();
  if (Number.isNaN(publishedAt)) return 0;
  return Math.max(0, PUBLISH_WINDOW_SECONDS - Math.floor((now - publishedAt) / 1000));
}

/**
 * The pool of unclaimed broadcast orders behind the Available tab.
 *
 * Realtime events are treated purely as cache invalidation: `publish_order`
 * sends no address or payout over Pusher, so the list is always re-read from
 * `GET /orders/published`. That endpoint returns current state — published,
 * unclaimed, inside the 15-minute window — which means a driver coming online
 * picks up offers broadcast while they were away, and any event missed on a
 * dropped socket heals on the next refetch.
 *
 * Offline is a hard stop: no fetching, an empty list, and accepts refused. A
 * driver who ended their shift must not return to a screen of stale offers.
 */
export function PublishedOrdersProvider({ children }: { children: React.ReactNode }) {
  const { signOut } = useAuth();
  const { online, isRestoring } = useOnlineStatus();
  const { subscribe, connectionState } = useRealtime();
  const { refresh: refreshMyOrders } = useOrders();

  const [orders, setOrders] = useState<DriverOrder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // The online flag is read inside callbacks that must not be re-created on
  // every shift change (the realtime subscription in particular).
  const onlineRef = useRef(online);
  onlineRef.current = online;

  const load = useCallback(
    async (mode: 'initial' | 'refresh' | 'silent') => {
      if (!onlineRef.current) return;
      if (mode === 'initial') setIsLoading(true);
      if (mode === 'refresh') setIsRefreshing(true);

      try {
        const published = await getPublishedOrders();
        if (!onlineRef.current) return; // Went off shift mid-flight.
        setOrders(published);
        setNow(Date.now());
        setError(null);
      } catch (err: unknown) {
        if (err instanceof Error && err.message === SESSION_EXPIRED) {
          void signOut();
          return;
        }
        setError(err instanceof Error ? err.message : 'Could not load available orders.');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [signOut],
  );

  // Going online loads the pool; going offline empties it immediately.
  useEffect(() => {
    if (isRestoring) return;
    if (online) {
      void load('initial');
    } else {
      setOrders([]);
      setError(null);
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [online, isRestoring, load]);

  // Every (re)connection is a gap in coverage — resync rather than assume the
  // list survived it. Covers app resume, network flaps and the initial connect.
  useEffect(() => {
    if (connectionState !== 'connected' || !online) return;
    void load('silent');
  }, [connectionState, online, load]);

  useEffect(
    () =>
      subscribe((event) => {
        if (!onlineRef.current) return;

        if (event.event === 'order-accepted') {
          setOrders((current) => current.filter((order) => order.id !== event.order_id));
          // The winner may be this driver — their own list changed too.
          void refreshMyOrders();
          return;
        }

        if (
          event.event === 'order-published' ||
          event.event === 'order-updated' ||
          event.event === 'order-deleted' ||
          event.event === 'order-driver-changed'
        ) {
          void load('silent');
        }
      }),
    [subscribe, load, refreshMyOrders],
  );

  // One ticker for every countdown, and only while there is something to count.
  useEffect(() => {
    if (!online || orders.length === 0) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [online, orders.length]);

  const available = useMemo(() => {
    if (!online) return [];
    return orders
      .map((order) => ({ ...order, remainingSeconds: secondsLeft(order, now) }))
      .filter((order) => order.remainingSeconds > 0);
  }, [orders, now, online]);

  const accept = useCallback(
    async (orderId: string): Promise<AcceptOutcome> => {
      if (!onlineRef.current) {
        return { result: 'failed', message: 'Go online to accept orders.' };
      }

      try {
        const order = await acceptOrder(orderId);
        setOrders((current) => current.filter((item) => item.id !== orderId));
        void refreshMyOrders();
        return { result: 'accepted', order };
      } catch (err: unknown) {
        // 409 and 410 are normal outcomes of a race, not failures: drop the
        // card either way, since the offer is gone for this driver.
        if (isApiError(err) && (err.status === 409 || err.status === 410)) {
          setOrders((current) => current.filter((item) => item.id !== orderId));
          return {
            result: err.status === 409 ? 'taken' : 'expired',
            message:
              err.status === 409
                ? 'Another driver took this order.'
                : 'This offer expired.',
          };
        }
        if (err instanceof Error && err.message === SESSION_EXPIRED) {
          void signOut();
          return { result: 'failed', message: err.message };
        }
        return {
          result: 'failed',
          message: err instanceof Error ? err.message : 'Could not accept the order.',
        };
      }
    },
    [refreshMyOrders, signOut],
  );

  const value = useMemo<PublishedOrdersContextValue>(
    () => ({
      available,
      isLoading,
      isRefreshing,
      error,
      refresh: () => load('refresh'),
      accept,
    }),
    [available, isLoading, isRefreshing, error, load, accept],
  );

  return (
    <PublishedOrdersContext.Provider value={value}>{children}</PublishedOrdersContext.Provider>
  );
}

export function usePublishedOrders(): PublishedOrdersContextValue {
  const context = useContext(PublishedOrdersContext);
  if (!context) {
    throw new Error('usePublishedOrders must be used within a PublishedOrdersProvider');
  }
  return context;
}