import { useCallback, useState } from 'react';
import { useRouter } from 'expo-router';

import { useToast } from '@components/ui';
import { usePublishedOrders } from '@contexts';

/**
 * Claiming a broadcast offer, with the outcome messaging that goes with it.
 *
 * Shared by the Available list and the offer detail screen so a lost race reads
 * the same in both places: 409 and 410 are ordinary outcomes of racing other
 * drivers, reported as information rather than failure.
 */
export function useAcceptOffer(): {
  acceptOffer: (orderId: string) => Promise<void>;
  acceptingId: string | null;
} {
  const { accept } = usePublishedOrders();
  const { show } = useToast();
  const router = useRouter();
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  const acceptOffer = useCallback(
    async (orderId: string) => {
      setAcceptingId(orderId);
      try {
        const outcome = await accept(orderId);

        if (outcome.result === 'accepted') {
          show('Order accepted. It is now in your jobs.', { variant: 'success' });
          router.replace('/orders');
          router.push({ pathname: '/order/[id]', params: { id: outcome.order.id } });
          return;
        }

        show(outcome.message, { variant: outcome.result === 'failed' ? 'error' : 'info' });
      } finally {
        setAcceptingId(null);
      }
    },
    [accept, router, show],
  );

  return { acceptOffer, acceptingId };
}