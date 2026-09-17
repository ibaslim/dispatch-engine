import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { ReminderSettings } from '@components/ReminderSettings';
import { useTheme } from '@theme';

interface Props {
  onBack: () => void;
}

/** Full-screen reminder settings, pushed from Profile. */
export function RemindersScreen({ onBack }: Props) {
  const { palette } = useTheme();

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <View className="flex-row items-center gap-3 border-b border-border px-4 py-3">
        <TouchableOpacity onPress={onBack} hitSlop={10} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color={palette.foreground} />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-foreground">Reminders</Text>
      </View>

      <ScrollView contentContainerClassName="p-5" showsVerticalScrollIndicator={false}>
        <ReminderSettings />
      </ScrollView>
    </SafeAreaView>
  );
}
