import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
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
} from '@components/ui';

/** Job detail — pushed over the tabs. Placeholder content until wired to the API. */
export default function JobDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { palette } = useTheme();

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

        <Card accent>
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
          <Button title="Navigate" variant="outline" className="flex-1" onPress={() => {}} />
          <Button title="Mark delivered" className="flex-1" onPress={() => {}} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
