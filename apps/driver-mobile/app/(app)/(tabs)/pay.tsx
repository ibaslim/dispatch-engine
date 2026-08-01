import React from 'react';
import { useRouter } from 'expo-router';
import { ComingSoonScreen } from '@screens/ComingSoonScreen';

export default function PayRoute() {
  const router = useRouter();
  return (
    <ComingSoonScreen
      title="Earnings"
      icon="wallet-outline"
      message="Your daily payouts and per-trip earnings will appear here."
      onOpenSettings={() => router.push('/settings')}
    />
  );
}
