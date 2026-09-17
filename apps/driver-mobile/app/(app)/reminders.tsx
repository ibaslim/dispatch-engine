import React from 'react';
import { useRouter } from 'expo-router';
import { RemindersScreen } from '@screens/RemindersScreen';

export default function RemindersRoute() {
  const router = useRouter();
  return <RemindersScreen onBack={() => router.back()} />;
}
