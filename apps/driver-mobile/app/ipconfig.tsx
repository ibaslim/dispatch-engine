import React from 'react';
import { useRouter } from 'expo-router';
import { IpConfigScreen } from '@screens/IpConfigScreen';

export default function IpConfigRoute() {
  const router = useRouter();
  return <IpConfigScreen onClose={() => router.back()} />;
}
