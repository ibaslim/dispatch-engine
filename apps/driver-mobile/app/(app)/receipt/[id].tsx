import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { DeliveryReceiptScreen } from '@screens/DeliveryReceiptScreen';
import { useOrders } from '@contexts';

export default function DeliveryReceiptRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { getOrder } = useOrders();

  return <DeliveryReceiptScreen order={getOrder(id)} onBack={() => router.back()} />;
}