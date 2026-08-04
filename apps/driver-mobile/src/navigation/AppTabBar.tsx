import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { usePublishedOrders } from '@contexts';
import { BottomNav, type TabItem } from './BottomNav';

/** Icon + label per tab route name (route files: index, orders, available, ...). */
const TAB_META: Record<
  string,
  { label: string; icon: keyof typeof Ionicons.glyphMap; iconOutline: keyof typeof Ionicons.glyphMap }
> = {
  index: { label: 'Home', icon: 'home', iconOutline: 'home-outline' },
  orders: { label: 'Orders', icon: 'receipt', iconOutline: 'receipt-outline' },
  available: { label: 'Available', icon: 'megaphone', iconOutline: 'megaphone-outline' },
  activity: { label: 'Activity', icon: 'time', iconOutline: 'time-outline' },
  profile: { label: 'Profile', icon: 'person', iconOutline: 'person-outline' },
};

// Minimal structural slice of the tab bar props we consume, so this file doesn't
// depend on @react-navigation/bottom-tabs resolving at the top level.
interface TabBarProps {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: {
    navigate: (name: string) => void;
    emit: (event: {
      type: 'tabPress';
      target: string;
      canPreventDefault: true;
    }) => { defaultPrevented: boolean };
  };
}

/**
 * Adapts Expo Router's <Tabs> tab-bar props to our presentational BottomNav,
 * preserving the standard tabPress semantics (emit event → navigate unless a
 * listener prevented default, e.g. pop-to-top on re-press).
 */
export function AppTabBar({ state, navigation }: TabBarProps) {
  // Available is the only badged tab: an offer expires in 15 minutes, so the
  // count has to reach the driver wherever they are in the app. The Orders
  // count is not time-critical in the same way and lives in that screen's
  // header, beside the filters that break it down.
  const { available } = usePublishedOrders();

  const tabs: TabItem[] = state.routes
    .filter((r) => TAB_META[r.name])
    .map((r) => ({
      key: r.name,
      ...TAB_META[r.name],
      badge: r.name === 'available' ? available.length : undefined,
    }));

  const activeKey = state.routes[state.index]?.name ?? 'index';

  const handlePress = (name: string) => {
    const route = state.routes.find((r) => r.name === name);
    if (!route) return;
    const isFocused = name === activeKey;
    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });
    if (!isFocused && !event.defaultPrevented) {
      navigation.navigate(name);
    }
  };

  return <BottomNav tabs={tabs} activeKey={activeKey} onTabPress={handlePress} />;
}
