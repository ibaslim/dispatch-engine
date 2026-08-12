import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { PhotoCaptureScreen } from '@screens/PhotoCaptureScreen';
import { useOrders } from '@contexts';
import type { ProofOfDelivery } from '@types';

export default function PodPhotoRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { getOrder, patchOrder } = useOrders();
  const order = getOrder(id);

  function onUploaded(changes: Partial<NonNullable<ProofOfDelivery['submission']>>) {
    if (order) {
      patchOrder(order.id, {
        proof_of_delivery: {
          ...order.proof_of_delivery,
          submission: { ...order.proof_of_delivery?.submission, ...changes },
        },
      });
    }
    router.back();
  }

  return (
    <PhotoCaptureScreen
      orderId={id}
      orderNumber={order?.order_number ?? null}
      onCancel={() => router.back()}
      onUploaded={onUploaded}
    />
  );
}