import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { AppearanceControls } from '@components/AppearanceControls';
import { ThemePreviewCard } from '@components/ThemePreviewCard';
import { useTheme } from '@theme';

interface Props {
  onClose: () => void;
}

export function SettingsScreen({ onClose }: Props) {
  const { palette } = useTheme();
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-row items-center justify-between px-5 py-4 border-b border-border">
        <Text className="text-2xl font-bold text-foreground">Settings</Text>
        <TouchableOpacity onPress={onClose} hitSlop={12}>
          <Text className="text-base font-semibold text-primary">Done</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerClassName="p-5 gap-8">
        {/* Server IP Config Link */}
        <TouchableOpacity
          onPress={() => router.push('/ipconfig')}
          className="flex-row items-center justify-between rounded-xl border border-border bg-card p-4"
        >
          <View className="flex-row items-center gap-3">
            <Ionicons name="hardware-chip-outline" size={20} color={palette.primary} />
            <View>
              <Text className="text-base font-semibold text-foreground">Server IP Config</Text>
              <Text className="text-xs text-muted">Set backend target IP address</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={palette.muted} />
        </TouchableOpacity>

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

