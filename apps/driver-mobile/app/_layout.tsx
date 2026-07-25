import '../global.css';
import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from '@theme';
import { AuthProvider } from '@contexts';
import { setupNotificationRouting } from '@services/notifications';

/** StatusBar bar-style follows the resolved light/dark scheme. */
function ThemedStatusBar() {
  const { scheme } = useTheme();
  return <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />;
}

/**
 * Root layout: app-wide providers + the top-level stack.
 * Routes: `(app)` (authenticated area), `login` (public), `settings` (modal).
 */
export default function RootLayout() {
  // Deep-link notification taps to the relevant route (no-ops without Firebase).
  useEffect(() => setupNotificationRouting(), []);

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <ThemedStatusBar />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(app)" />
            <Stack.Screen name="login" />
            <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
          </Stack>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
