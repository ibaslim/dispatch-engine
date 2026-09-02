import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@theme';
import { Button, Card, CardBody, Badge, useToast } from '@components/ui';
import {
  getActiveServerUrl,
  setCustomServerUrl,
  resetCustomServerUrl,
  testServerConnection,
  formatServerUrl,
} from '@services/api';

interface Props {
  onClose: () => void;
}

export function IpConfigScreen({ onClose }: Props) {
  const { palette } = useTheme();
  const toast = useToast();

  const [activeUrl, setActiveUrl] = useState<string>(getActiveServerUrl());
  const [inputIp, setInputIp] = useState<string>(getActiveServerUrl());
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const current = getActiveServerUrl();
    setActiveUrl(current);
    setInputIp(current);
  }, []);

  const defaultUrl = process.env['EXPO_PUBLIC_API_BASE_URL'] ?? 'http://localhost:8000';
  const isCustom = activeUrl !== defaultUrl;

  async function handleTestConnection() {
    if (!inputIp.trim()) return;
    setIsTesting(true);
    try {
      const result = await testServerConnection(inputIp);
      toast.show(result.message, { variant: result.success ? 'success' : 'error' });
    } finally {
      setIsTesting(false);
    }
  }

  async function handleSave() {
    if (!inputIp.trim()) return;
    setIsSaving(true);
    try {
      const formatted = await setCustomServerUrl(inputIp);
      setActiveUrl(formatted);
      setInputIp(formatted);
      toast.show('Server IP updated successfully! Traffic will now route to this backend.', {
        variant: 'success',
      });
    } catch (err: unknown) {
      toast.show(err instanceof Error ? err.message : 'Failed to save server IP', {
        variant: 'error',
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleReset() {
    setIsSaving(true);
    try {
      const resetUrl = await resetCustomServerUrl();
      setActiveUrl(resetUrl);
      setInputIp(resetUrl);
      toast.show('Reset to default auto-detected server IP.', { variant: 'success' });
    } catch (err: unknown) {
      toast.show('Failed to reset server IP', { variant: 'error' });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <View className="flex-row items-center justify-between border-b border-border px-5 py-4">
        <View className="flex-row items-center gap-2">
          <Ionicons name="hardware-chip-outline" size={24} color={palette.primary} />
          <Text className="text-xl font-bold text-foreground">Server IP Config</Text>
        </View>
        <TouchableOpacity onPress={onClose} hitSlop={12}>
          <Text className="text-base font-semibold text-primary">Done</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <ScrollView contentContainerClassName="gap-6 p-5 pb-10" showsVerticalScrollIndicator={false}>
          {/* Active Server Card */}
          <Card>
            <CardBody className="gap-3">
              <View className="flex-row items-center justify-between">
                <Text className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Active Server Target
                </Text>
                <Badge label={isCustom ? 'Custom Override' : 'Default LAN'} />
              </View>
              <Text className="text-lg font-bold text-primary" numberOfLines={1}>
                {activeUrl}
              </Text>
              <Text className="text-xs leading-5 text-muted">
                All app traffic (login, location heartbeats, order updates) is currently routed to this backend address.
              </Text>
            </CardBody>
          </Card>

          {/* Form Section */}
          <View className="gap-4">
            <Text className="text-base font-semibold text-foreground">
              Configure Backend IP Address
            </Text>

            <View>
              <Text className="mb-1.5 text-sm font-medium text-foreground">
                Server IP or Hostname
              </Text>
              <TextInput
                value={inputIp}
                onChangeText={setInputIp}
                placeholder="192.168.1.15:8000"
                placeholderTextColor={palette.muted}
                keyboardType="url"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isSaving && !isTesting}
                className="w-full rounded-xl border border-border bg-input px-4 py-3.5 text-base text-foreground"
              />
              <Text className="mt-1.5 text-xs text-muted">
                Format: <Text className="font-mono">192.168.1.X:8000</Text> or <Text className="font-mono">http://192.168.1.X:8000</Text>
              </Text>
            </View>

            {/* Test Connection Button */}
            <TouchableOpacity
              onPress={handleTestConnection}
              disabled={isTesting || isSaving}
              className="flex-row items-center justify-center gap-2 rounded-xl border border-border bg-card py-3.5"
            >
              {isTesting ? (
                <ActivityIndicator size="small" color={palette.primary} />
              ) : (
                <Ionicons name="wifi-outline" size={18} color={palette.primary} />
              )}
              <Text className="text-base font-semibold text-primary">
                {isTesting ? 'Testing Connection...' : 'Test Connection'}
              </Text>
            </TouchableOpacity>

            {/* Save Button */}
            <Button
              title="Save & Apply IP"
              variant="primary"
              loading={isSaving}
              onPress={handleSave}
              className="mt-2"
            />

            {/* Reset Button */}
            {isCustom && (
              <TouchableOpacity
                onPress={handleReset}
                disabled={isSaving}
                className="flex-row items-center justify-center gap-1.5 py-2"
              >
                <Ionicons name="refresh-outline" size={16} color={palette.muted} />
                <Text className="text-sm font-medium text-muted">
                  Reset to Default IP ({defaultUrl})
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
