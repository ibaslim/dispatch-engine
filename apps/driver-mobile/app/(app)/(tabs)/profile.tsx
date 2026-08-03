import React from 'react';
import { useRouter } from 'expo-router';
import { ProfileScreen } from '@screens/ProfileScreen';
import { useAuth } from '@contexts';

export default function ProfileRoute() {
  const router = useRouter();
  const { user, signOut } = useAuth();

  return (
    <ProfileScreen
      user={user}
      onOpenAppearance={() => router.push('/appearance')}
      onOpenIpConfig={() => router.push('/ipconfig')}
      onSignOut={signOut}
    />
  );
}
