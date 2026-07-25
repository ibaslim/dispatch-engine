import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@theme';

export interface TabItem {
  key: string;
  label: string;
  /** Filled glyph, shown when the tab is active. */
  icon: keyof typeof Ionicons.glyphMap;
  /** Outline glyph, shown when inactive. */
  iconOutline: keyof typeof Ionicons.glyphMap;
}

interface Props {
  tabs: TabItem[];
  activeKey: string;
  onTabPress: (key: string) => void;
}

/**
 * Bottom tab bar. Active state uses the app's tonal language (a primary-muted
 * capsule behind a filled icon, matching badges/accents); inactive tabs use
 * outline icons in the muted color. Labels stay visible for at-a-glance use.
 *
 * Colors that back className tokens (icon `color`) come from `palette` because
 * Ionicons takes an imperative color prop. Ternary class strings are written as
 * full literals so NativeWind can extract them.
 */
export function BottomNav({ tabs, activeKey, onTabPress }: Props) {
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();

  return (
    <View
      className="flex-row border-t border-border bg-surface px-2 pt-2"
      style={{ paddingBottom: Math.max(insets.bottom, 10) }}
    >
      {tabs.map((tab) => {
        const active = tab.key === activeKey;
        return (
          <TouchableOpacity
            key={tab.key}
            onPress={() => onTabPress(tab.key)}
            activeOpacity={0.7}
            className="flex-1 items-center gap-1"
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={tab.label}
          >
            <View
              className={
                active
                  ? 'rounded-full bg-primary-muted px-5 py-1'
                  : 'px-5 py-1'
              }
            >
              <Ionicons
                name={active ? tab.icon : tab.iconOutline}
                size={22}
                color={active ? palette['primary-muted-foreground'] : palette.muted}
              />
            </View>
            <Text
              numberOfLines={1}
              className={
                active
                  ? 'text-[11px] font-semibold text-primary-muted-foreground'
                  : 'text-[11px] text-muted'
              }
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
