import React from 'react';
import { useRouter } from 'expo-router';
import { AppearanceScreen } from '@screens/AppearanceScreen';

export default function AppearanceRoute() {
  const router = useRouter();
  return <AppearanceScreen onBack={() => router.back()} />;
}
