import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Redirect, Stack } from 'expo-router';
import { OnlineStatusProvider, OrdersProvider, useAuth } from '@contexts';
import { useTheme } from '@theme';

/**
 * Authenticated area. Guards every child route: shows a spinner while the
 * session loads, redirects to /login when signed out, otherwise renders the
 * stack (tabs + pushed detail screens).
 */
export default function AppLayout() {
  const { session, isLoading } = useAuth();
  const { palette } = useTheme();

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color={palette.primary} />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/login" />;
  }

  // Orders load once here rather than per screen — the list, the detail screen
  // and the tab-bar badge all read the same cache.
  return (
    <OrdersProvider>
      <OnlineStatusProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="job/[id]" />
          <Stack.Screen name="order/[id]" />
          <Stack.Screen name="appearance" />
        </Stack>
      </OnlineStatusProvider>
    </OrdersProvider>
  );
}
