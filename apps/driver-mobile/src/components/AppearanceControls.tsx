import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useTheme, THEME_LIST, type ThemeMode } from '@theme';

const MODES: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="text-xs font-semibold uppercase tracking-wider text-muted">
      {children}
    </Text>
  );
}

/**
 * Theme mode selector + accent swatches. Shared by the Appearance modal and the
 * Profile screen so both stay in sync with a single implementation.
 */
export function AppearanceControls() {
  const { mode, themeName, setMode, setThemeName } = useTheme();

  return (
    <View className="gap-8">
      {/* Mode */}
      <View className="gap-3">
        <SectionLabel>Mode</SectionLabel>
        <View className="flex-row rounded-2xl bg-input p-1">
          {MODES.map((m) => {
            const active = mode === m.value;
            return (
              <TouchableOpacity
                key={m.value}
                onPress={() => setMode(m.value)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                className={`flex-1 items-center rounded-xl py-2.5 ${active ? 'bg-primary' : ''}`}
              >
                <Text
                  className={`text-sm font-semibold ${
                    active ? 'text-primary-foreground' : 'text-muted'
                  }`}
                >
                  {m.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Theme color */}
      <View className="gap-3">
        <SectionLabel>Theme color</SectionLabel>
        <View className="flex-row flex-wrap">
          {THEME_LIST.map((t) => {
            const selected = themeName === t.name;
            return (
              <TouchableOpacity
                key={t.name}
                onPress={() => setThemeName(t.name)}
                className="w-1/4 items-center py-3"
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`${t.label} theme`}
              >
                <View
                  className={`h-14 w-14 items-center justify-center rounded-full border-2 ${
                    selected ? 'border-foreground' : 'border-transparent'
                  }`}
                >
                  <View
                    className="h-11 w-11 items-center justify-center rounded-full"
                    style={{ backgroundColor: t.swatch }}
                  >
                    {selected && <Text className="text-lg font-bold text-white">✓</Text>}
                  </View>
                </View>
                <Text
                  className={`mt-1.5 text-xs ${
                    selected ? 'font-semibold text-foreground' : 'text-muted'
                  }`}
                >
                  {t.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}
