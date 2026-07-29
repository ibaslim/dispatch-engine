import React from 'react';
import { useRouter } from 'expo-router';
import { OrdersScreen } from '@screens/OrdersScreen';

export default function OrdersRoute() {
  const router = useRouter();
  return (
    <OrdersScreen
      onOrderPress={(id) => router.push({ pathname: '/order/[id]', params: { id } })}
    />
  );
}