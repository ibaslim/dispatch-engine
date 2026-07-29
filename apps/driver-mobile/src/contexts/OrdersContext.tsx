import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { getMyOrders } from '@services/orders';
import type { DriverOrder } from '@types';
import { useAuth } from './AuthContext';

const SESSION_EXPIRED = 'Session expired. Please log in again.';

interface OrdersContextValue {
  /** Every order assigned to the signed-in driver. */
  orders: DriverOrder[];
  /** Orders still needing work — what the Orders tab lists. */
  inProgress: DriverOrder[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** Look up one order. See the note on `GET /orders/{id}` below. */
  getOrder: (id: string) => DriverOrder | undefined;
  /** Merge a server response into one order without refetching the list. */
  patchOrder: (id: string, changes: Partial<DriverOrder>) => void;
}

const OrdersContext = createContext<OrdersContextValue | null>(null);

/**
 * Holds the driver's order list for the whole authenticated area.
 *
 * It's a provider rather than a per-screen hook because three consumers need
 * the same data: the Orders list, the order detail screen, and the tab bar's
 * in-progress badge. Fetching per screen would triple the calls and let the
 * badge drift out of sync with the list.
 *
 * The detail screen reads from this cache instead of fetching one order,
 * because the API has no `GET /orders/{id}` — `orders.py` exposes only the
 * collection and `/published`. If that endpoint is added later, the detail
 * screen can fetch directly and this stays the list cache.
 */
export function OrdersProvider({ children }: { children: React.ReactNode }) {
  const { session, signOut } = useAuth();
  const [orders, setOrders] = useState<DriverOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (mode: 'initial' | 'refresh') => {
      if (mode === 'refresh') setIsRefreshing(true);
      try {
        setOrders(await getMyOrders());
        setError(null);
      } catch (err: unknown) {
        if (err instanceof Error && err.message === SESSION_EXPIRED) {
          signOut();
          return;
        }
        setError(err instanceof Error ? err.message : 'Could not load your orders.');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [signOut],
  );

  useEffect(() => {
    if (!session) return;
    load('initial');
  }, [session, load]);

  const refresh = useCallback(() => load('refresh'), [load]);

  const patchOrder = useCallback((id: string, changes: Partial<DriverOrder>) => {
    setOrders((current) =>
      current.map((order) => (order.id === id ? { ...order, ...changes } : order)),
    );
  }, []);

  const value = useMemo<OrdersContextValue>(() => {
    const inProgress = orders.filter((order) => order.activity_status !== 'delivered');
    return {
      orders,
      inProgress,
      isLoading,
      isRefreshing,
      error,
      refresh,
      getOrder: (id: string) => orders.find((order) => order.id === id),
      patchOrder,
    };
  }, [orders, isLoading, isRefreshing, error, refresh, patchOrder]);

  return <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>;
}

export function useOrders(): OrdersContextValue {
  const context = useContext(OrdersContext);
  if (!context) throw new Error('useOrders must be used within an OrdersProvider');
  return context;
}