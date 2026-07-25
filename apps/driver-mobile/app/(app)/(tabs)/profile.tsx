import React from 'react';
import { useRouter } from 'expo-router';
import { ComingSoonScreen } from '@screens/ComingSoonScreen';

export default function ProfileRoute() {
  const router = useRouter();
  return (
    <ComingSoonScreen
      title="Profile"
      icon="person-outline"
      message="Manage your account, vehicle, and payout details."
      onOpenSettings={() => router.push('/settings')}
    />
  );
}
