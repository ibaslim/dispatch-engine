import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme, THEME_LIST, type ThemeMode } from '@theme';

interface Props {
  onClose: () => void;
}

const MODES: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

export function SettingsScreen({ onClose }: Props) {
  const { mode, themeName, setMode, setThemeName } = useTheme();

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 py-4 border-b border-border">
        <Text className="text-2xl font-bold text-foreground">Appearance</Text>
        <TouchableOpacity onPress={onClose} hitSlop={12}>
          <Text className="text-base font-semibold text-primary">Done</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerClassName="p-5 gap-8">
        {/* Mode */}
        <View className="gap-3">
          <Text className="text-xs font-semibold uppercase tracking-wider text-muted">
            Mode
          </Text>
          <View className="flex-row rounded-2xl bg-input p-1">
            {MODES.map((m) => {
              const active = mode === m.value;
              return (
                <TouchableOpacity
                  key={m.value}
                  onPress={() => setMode(m.value)}
                  className={`flex-1 items-center rounded-xl py-2.5 ${
                    active ? 'bg-primary' : ''
                  }`}
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
          <Text className="text-xs font-semibold uppercase tracking-wider text-muted">
            Theme color
          </Text>
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
                      {selected && (
                        <Text className="text-lg font-bold text-white">✓</Text>
                      )}
                    </View>
                  </View>
                  <Text
                    className={`mt-1.5 text-xs ${
                      selected
                        ? 'font-semibold text-foreground'
                        : 'text-muted'
                    }`}
                  >
                    {t.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Live preview */}
        <View className="gap-3">
          <Text className="text-xs font-semibold uppercase tracking-wider text-muted">
            Preview
          </Text>
          <View className="rounded-2xl border border-border bg-card p-5">
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="text-base font-semibold text-foreground">
                Order #A-1029
              </Text>
              <View className="rounded-full bg-primary-muted px-3 py-1">
                <Text className="text-xs font-medium text-primary-muted-foreground">
                  in transit
                </Text>
              </View>
            </View>
            <Text className="text-sm text-muted">
              Pickup and delivery details appear here.
            </Text>
            <View className="mt-4 items-center rounded-xl bg-primary py-3">
              <Text className="text-sm font-semibold text-primary-foreground">
                Primary action
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
