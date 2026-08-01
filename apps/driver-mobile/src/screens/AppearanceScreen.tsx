import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@theme';
import { AppearanceControls } from '@components/AppearanceControls';
import { ThemePreviewCard } from '@components/ThemePreviewCard';

interface Props {
  onBack: () => void;
}

/** Full-screen appearance settings, pushed from Profile. */
export function AppearanceScreen({ onBack }: Props) {
  const { palette } = useTheme();

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <View className="flex-row items-center gap-3 border-b border-border px-4 py-3">
        <TouchableOpacity onPress={onBack} hitSlop={10} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color={palette.foreground} />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-foreground">Appearance</Text>
      </View>

      <ScrollView contentContainerClassName="gap-8 p-5" showsVerticalScrollIndicator={false}>
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
