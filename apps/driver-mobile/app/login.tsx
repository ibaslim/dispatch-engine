import React from 'react';
import { Redirect, useRouter } from 'expo-router';
import { LoginScreen } from '@screens/LoginScreen';
import { useAuth } from '@contexts';

export default function LoginRoute() {
  const router = useRouter();
  const { session, signIn } = useAuth();

  // Never show the login screen to an already-authenticated user.
  if (session) {
    return <Redirect href="/" />;
  }

  return (
    <LoginScreen
      onSubmit={signIn}
      onLoginSuccess={() => router.replace('/')}
      onOpenSettings={() => router.push('/settings')}
      onOpenIpConfig={() => router.push('/ipconfig')}
    />
  );
}
