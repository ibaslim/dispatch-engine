import React from 'react';
import { useRouter } from 'expo-router';
import { AvailableScreen } from '@screens/AvailableScreen';

export default function AvailableRoute() {
  const router = useRouter();
  return (
    <AvailableScreen
      onOrderPress={(id) => router.push({ pathname: '/offer/[id]', params: { id } })}
    />
  );
}