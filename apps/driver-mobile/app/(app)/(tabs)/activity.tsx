import React from 'react';
import { useRouter } from 'expo-router';
import { ComingSoonScreen } from '@screens/ComingSoonScreen';

export default function ActivityRoute() {
  const router = useRouter();
  return (
    <ComingSoonScreen
      title="Activity"
      icon="time-outline"
      message="A history of your completed deliveries will appear here."
      onOpenSettings={() => router.push('/settings')}
    />
  );
}
