import React from 'react';
import { useRouter } from 'expo-router';
import { LoginScreen } from '@screens/LoginScreen';
import { useAuth } from '@contexts';

export default function LoginRoute() {
  const router = useRouter();
  const { signIn } = useAuth();

  return (
    <LoginScreen
      onSubmit={signIn}
      onLoginSuccess={() => router.replace('/')}
      onOpenSettings={() => router.push('/settings')}
    />
  );
}
