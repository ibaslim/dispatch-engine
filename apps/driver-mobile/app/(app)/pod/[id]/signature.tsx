import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SignatureCaptureScreen } from '@screens/SignatureCaptureScreen';
import { useOrders } from '@contexts';
import type { ProofOfDelivery } from '@types';

export default function PodSignatureRoute() {
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
    <SignatureCaptureScreen
      orderId={id}
      initialName={order?.proof_of_delivery?.submission?.recipient_name ?? ''}
      onCancel={() => router.back()}
      onUploaded={onUploaded}
    />
  );
}