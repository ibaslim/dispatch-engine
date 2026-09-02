import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { OfferDetailScreen } from '@screens/OfferDetailScreen';
import { usePublishedOrders } from '@contexts';
import { useAcceptOffer } from '@hooks';

export default function OfferDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { available } = usePublishedOrders();
  const { acceptOffer, acceptingId } = useAcceptOffer();

  // Read straight from the live pool: when the offer is claimed or expires the
  // screen turns itself into the "no longer available" state, with no polling.
  const order = available.find((candidate) => candidate.id === id);

  return (
    <OfferDetailScreen
      order={order}
      accepting={acceptingId === id}
      onAccept={() => acceptOffer(id, { replace: true })}
      onBack={() => router.back()}
    />
  );
}