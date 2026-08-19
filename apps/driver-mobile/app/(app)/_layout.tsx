import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Redirect, Stack, router } from 'expo-router';
import { consumePendingRoute, subscribePendingRoute } from '@services/notifications';
import {
  OnlineStatusProvider,
  OrdersProvider,
  PublishedOrdersProvider,
  RealtimeProvider,
  useAuth,
} from '@contexts';
import { useTheme } from '@theme';
import { useDriverLocation } from '@hooks';

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

  return (
    <OrdersProvider>
      <OnlineStatusProvider>
        <RealtimeProvider>
          <PublishedOrdersProvider>
            {/* Mount the location heartbeat once for the whole authenticated session */}
            <LocationHeartbeat />
            <PendingRouteReplay />
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="order/[id]" />
              <Stack.Screen name="offer/[id]" />
              <Stack.Screen name="receipt/[id]" />
              <Stack.Screen name="pod/[id]/photo" />
              <Stack.Screen name="pod/[id]/signature" />
              <Stack.Screen name="appearance" />
            </Stack>
          </PublishedOrdersProvider>
        </RealtimeProvider>
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

/**
 * Navigates to a cold-start notification route once the authenticated stack is
 * mounted. Pushing any earlier is discarded by the auth guard's redirect.
 */
function PendingRouteReplay(): null {
  useEffect(() => {
    const drain = () => {
      const route = consumePendingRoute();
      if (route) router.push(route as never);
    };
    drain();
    return subscribePendingRoute(drain);
  }, []);
  return null;
}
