import React from 'react';
import { Tabs } from 'expo-router';
import { AppTabBar } from '@navigation/AppTabBar';

/**
 * Bottom-tab group. Uses our BottomNav (via AppTabBar) as the custom tab bar.
 * Tabs stay mounted across switches (state/scroll preserved) — the key fix over
 * the old conditional-render switcher.
 */
export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <AppTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="orders" />
      <Tabs.Screen name="available" />
      <Tabs.Screen name="activity" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
