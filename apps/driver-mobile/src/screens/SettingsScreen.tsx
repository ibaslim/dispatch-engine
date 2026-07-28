import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppearanceControls } from '@components/AppearanceControls';
import { ThemePreviewCard } from '@components/ThemePreviewCard';

interface Props {
  onClose: () => void;
}

export function SettingsScreen({ onClose }: Props) {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-row items-center justify-between px-5 py-4 border-b border-border">
        <Text className="text-2xl font-bold text-foreground">Appearance</Text>
        <TouchableOpacity onPress={onClose} hitSlop={12}>
          <Text className="text-base font-semibold text-primary">Done</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerClassName="p-5 gap-8">
        <AppearanceControls />
        <View className="gap-3">
          <Text className="text-xs font-semibold uppercase tracking-wider text-muted">
            Preview
          </Text>
          <ThemePreviewCard />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
