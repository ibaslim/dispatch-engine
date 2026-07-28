import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@theme';
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Badge,
  Ref,
  Button,
  BottomSheet,
  BottomSheetTitle,
  BottomSheetItem,
} from '@components/ui';

/** Job detail — pushed over the tabs. Placeholder content until wired to the API. */
export default function JobDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { palette } = useTheme();
  const [contactOpen, setContactOpen] = useState(false);

  const call = (number: string) => {
    setContactOpen(false);
    Linking.openURL(`tel:${number}`).catch(() => {
      // No dialer available (e.g. emulator) — ignore.
    });
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <View className="flex-row items-center gap-3 border-b border-border px-4 py-3">
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color={palette.foreground} />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-foreground">Job details</Text>
      </View>

      <ScrollView contentContainerClassName="gap-5 p-5">
        <View className="flex-row items-center justify-between">
          <Ref>{id ?? '—'}</Ref>
          <Badge label="in transit" />
        </View>

        <Card>
          <CardHeader>
            <CardTitle>Route</CardTitle>
          </CardHeader>
          <CardBody className="gap-2">
            <Text className="text-sm text-muted">📦 128 King St, Sydney</Text>
            <Text className="text-sm text-muted">📍 40 Harbour Esplanade, Docklands</Text>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <Text className="text-sm leading-5 text-muted">
              Full job details, proof-of-delivery capture, and status updates will
              render here.
            </Text>
          </CardBody>
        </Card>

        <View className="flex-row gap-3">
          <Button
            title="Contact"
            variant="outline"
            className="flex-1"
            onPress={() => setContactOpen(true)}
          />
          <Button title="Mark delivered" className="flex-1" onPress={() => {}} />
        </View>
      </ScrollView>

      <BottomSheet visible={contactOpen} onClose={() => setContactOpen(false)}>
        <BottomSheetTitle>Contact</BottomSheetTitle>
        <BottomSheetItem
          icon="call"
          title="Call Pickup Contact"
          subtitle="Dana (Cafe Umbra)"
          onPress={() => call('+15035550148')}
        />
        <BottomSheetItem
          icon="call"
          title="Call Recipient"
          subtitle="Alex Kim"
          onPress={() => call('+15035550172')}
        />
        <BottomSheetItem
          icon="help-buoy"
          title="Contact Support"
          subtitle="Dispatch help desk"
          tint="rose"
          onPress={() => call('+18005550100')}
          last
        />
      </BottomSheet>
    </SafeAreaView>
  );
}
