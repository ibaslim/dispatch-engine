import { useCallback, useEffect, useState } from 'react';

import { useOrders } from '@contexts';
import { getRoutePlan } from '@services/orders';
import type { RoutePlan } from '@dispatch/shared/contracts';
import { useDriverPosition } from './useDriverPosition';

interface RoutePlanState {
  plan: RoutePlan | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * The driver's outstanding stops in an efficient order.
 *
 * Keyed off the order list rather than a timer: the stop set only changes when
 * a job advances or arrives, and `useDriverPosition` already throttles movement
 * to 50 m, so a stationary driver re-plans no more than the list itself churns.
 * Null while offline, which is what hides the card.
 */
export function useRoutePlan(): RoutePlanState {
  const position = useDriverPosition();
  const { inProgress } = useOrders();
  const [plan, setPlan] = useState<RoutePlan | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only the stops themselves matter; re-planning on an unrelated field change
  // would spend a Routes call for an identical answer.
  const signature = inProgress
    .map((order) => `${order.id}:${order.activity_status}`)
    .sort()
    .join('|');

  const load = useCallback(async () => {
    if (!position || signature === '') {
      setPlan(null);
      return;
    }
    setIsLoading(true);
    try {
      setPlan(await getRoutePlan(position.lat, position.lng));
      setError(null);
    } catch (err: unknown) {
      setPlan(null);
      setError(err instanceof Error ? err.message : 'Could not plan your route.');
    } finally {
      setIsLoading(false);
    }
  }, [position, signature]);

  useEffect(() => {
    load();
  }, [load]);

  return { plan, isLoading, error, refresh: load };
}
