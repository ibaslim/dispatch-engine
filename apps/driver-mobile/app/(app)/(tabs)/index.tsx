import React from 'react';
import { useRouter } from 'expo-router';
import { JobsScreen } from '@screens/JobsScreen';
import { useAuth } from '@contexts';

export default function JobsRoute() {
  const router = useRouter();
  const { signOut } = useAuth();

  return (
    <JobsScreen
      onOpenSettings={() => router.push('/settings')}
      onLogout={signOut}
      onJobPress={(id) => router.push({ pathname: '/job/[id]', params: { id } })}
    />
  );
}
