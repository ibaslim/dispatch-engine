import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { BottomNav, type TabItem } from './BottomNav';

/** Icon + label per tab route name (route files: index, route, pay, ...). */
const TAB_META: Record<
  string,
  { label: string; icon: keyof typeof Ionicons.glyphMap; iconOutline: keyof typeof Ionicons.glyphMap }
> = {
  index: { label: 'Jobs', icon: 'cube', iconOutline: 'cube-outline' },
  route: { label: 'Route', icon: 'navigate', iconOutline: 'navigate-outline' },
  pay: { label: 'Pay', icon: 'wallet', iconOutline: 'wallet-outline' },
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
  const tabs: TabItem[] = state.routes
    .filter((r) => TAB_META[r.name])
    .map((r) => ({ key: r.name, ...TAB_META[r.name] }));

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
