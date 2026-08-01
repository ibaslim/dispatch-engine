import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Redirect, Stack } from 'expo-router';
import { OnlineStatusProvider, OrdersProvider, useAuth } from '@contexts';
import { useTheme } from '@theme';
import { useDriverLocation } from '@hooks';

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
        {/* Mount the location heartbeat once for the whole authenticated session */}
        <LocationHeartbeat />
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

/**
 * Mounts the GPS location heartbeat hook inside the provider tree so it has
 * access to both OnlineStatus and Auth contexts.
 * Renders nothing — this is a pure side-effect component.
 */
function LocationHeartbeat(): null {
  useDriverLocation();
  return null;
}
