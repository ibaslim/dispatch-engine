import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@theme';

interface Props {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  message: string;
  onOpenSettings: () => void;
}

/** Placeholder tab screen: header + a centered themed empty state. */
export function ComingSoonScreen({ title, icon, message, onOpenSettings }: Props) {
  const { palette } = useTheme();

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <View className="flex-row items-center justify-between border-b border-border px-5 py-4">
        <Text className="text-2xl font-bold text-foreground">{title}</Text>
        <TouchableOpacity onPress={onOpenSettings} hitSlop={8} accessibilityLabel="Appearance settings">
          <Ionicons name="settings-outline" size={22} color={palette.muted} />
        </TouchableOpacity>
      </View>

      <View className="flex-1 items-center justify-center gap-4 px-10">
        <View className="rounded-full bg-primary-muted p-6">
          <Ionicons name={icon} size={40} color={palette['primary-muted-foreground']} />
        </View>
        <Text className="text-lg font-bold text-foreground">{title}</Text>
        <Text className="text-center text-sm leading-5 text-muted">{message}</Text>
      </View>
    </SafeAreaView>
  );
}
