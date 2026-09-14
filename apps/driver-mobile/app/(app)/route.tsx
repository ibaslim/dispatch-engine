import React from 'react';
import { useRouter } from 'expo-router';
import { RouteScreen } from '@screens/RouteScreen';

export default function RouteRoute() {
  const router = useRouter();
  return (
    <RouteScreen
      onBack={() => router.back()}
      onStopPress={(id) => router.push({ pathname: '/order/[id]', params: { id } })}
    />
  );
}
