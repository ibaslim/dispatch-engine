import React from 'react';
import { useRouter } from 'expo-router';
import { ActivityScreen } from '@screens/ActivityScreen';

export default function ActivityRoute() {
  const router = useRouter();
  return <ActivityScreen onOrderPress={(id) => router.push(`/order/${id}`)} />;
}

