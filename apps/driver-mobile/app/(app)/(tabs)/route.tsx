import React from 'react';
import { useRouter } from 'expo-router';
import { ComingSoonScreen } from '@screens/ComingSoonScreen';

export default function RouteRoute() {
  const router = useRouter();
  return (
    <ComingSoonScreen
      title="Route"
      icon="navigate-outline"
      message="Turn-by-turn routing for your next stop will live here."
      onOpenSettings={() => router.push('/settings')}
    />
  );
}
