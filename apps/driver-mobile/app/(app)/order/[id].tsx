import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { OrderDetailScreen } from '@screens/OrderDetailScreen';
import { useOrders } from '@contexts';

export default function OrderDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { getOrder } = useOrders();

  return (
    <OrderDetailScreen
      order={getOrder(id)}
      onBack={() => router.back()}
      onCapturePhoto={() => router.push({ pathname: '/pod/[id]/photo', params: { id } })}
      onCaptureSignature={() => router.push({ pathname: '/pod/[id]/signature', params: { id } })}
    />
  );
}