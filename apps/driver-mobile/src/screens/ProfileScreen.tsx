import React from 'react';
import { View, Text, TouchableOpacity, Switch, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@theme';
import { Card, CardBody, Badge, Ref } from '@components/ui';
import { useMuteBroadcasts } from '@hooks';
import type { AuthUser } from '@contexts';

interface Props {
  user: AuthUser | null;
  onOpenAppearance: () => void;
  onOpenIpConfig?: () => void;
  onSignOut: () => void;
}

/** Derive up-to-two-letter initials for the avatar (e.g. "Sam Lee" -> "SL"). */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '·';
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '·';
}

function SectionTitle({ children }: { children: string }) {
  return <Text className="mb-3 text-lg font-bold text-foreground">{children}</Text>;
}

/** Round tinted icon chip used by the preference rows. */
function IconChip({ name }: { name: keyof typeof Ionicons.glyphMap }) {
  const { palette } = useTheme();
  return (
    <View className="h-10 w-10 items-center justify-center rounded-full bg-primary-muted">
      <Ionicons name={name} size={20} color={palette['primary-muted-foreground']} />
    </View>
  );
}

/** Driver account hub: identity, appearance, notification prefs, sign out. */
export function ProfileScreen({ user, onOpenAppearance, onOpenIpConfig, onSignOut }: Props) {
  const { palette } = useTheme();
  const { muted, setMuted } = useMuteBroadcasts();

  function confirmSignOut() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: onSignOut },
    ]);
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <View className="border-b border-border px-5 py-4">
        <Text className="text-2xl font-bold text-foreground">Profile</Text>
      </View>

      <ScrollView contentContainerClassName="gap-8 p-5 pb-10" showsVerticalScrollIndicator={false}>
        {/* Identity — a driver credential card */}
        <Card>
          <CardBody className="gap-4">
            <View className="flex-row items-center gap-4">
              <View className="h-16 w-16 items-center justify-center rounded-full bg-primary-muted">
                <Text className="text-2xl font-bold text-primary-muted-foreground">
                  {initialsOf(user?.name ?? '')}
                </Text>
              </View>
              <View className="flex-1">
                <Text className="text-xl font-bold text-foreground" numberOfLines={1}>
                  {user?.name ?? 'Driver'}
                </Text>
                {user?.email ? (
                  <Text className="mt-0.5 text-sm text-muted" numberOfLines={1}>
                    {user.email}
                  </Text>
                ) : null}
              </View>
            </View>
            <View className="flex-row items-center justify-between border-t border-border pt-4">
              <Badge label="Driver" />
              {user?.id ? <Ref>{user.id.slice(0, 8)}</Ref> : null}
            </View>
          </CardBody>
        </Card>

        {/* Preferences */}
        <View>
          <SectionTitle>Preferences</SectionTitle>
          <View className="gap-3">
            {/* Server IP Config */}
            {onOpenIpConfig ? (
              <TouchableOpacity
                onPress={onOpenIpConfig}
                accessibilityRole="button"
                accessibilityLabel="Server IP Configuration"
              >
                <Card>
                  <CardBody className="flex-row items-center gap-4">
                    <IconChip name="hardware-chip-outline" />
                    <View className="flex-1">
                      <Text className="text-base font-semibold text-foreground">Server IP Config</Text>
                      <Text className="mt-0.5 text-xs leading-5 text-muted">
                        Configure target backend IP address and test connection.
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={palette.muted} />
                  </CardBody>
                </Card>
              </TouchableOpacity>
            ) : null}

            {/* Appearance — navigates to the dedicated screen */}
            <TouchableOpacity
              onPress={onOpenAppearance}
              accessibilityRole="button"
              accessibilityLabel="Appearance"
            >
              <Card>
                <CardBody className="flex-row items-center gap-4">
                  <IconChip name="color-palette-outline" />
                  <View className="flex-1">
                    <Text className="text-base font-semibold text-foreground">Appearance</Text>
                    <Text className="mt-0.5 text-xs leading-5 text-muted">
                      Theme, colors, light and dark mode.
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={palette.muted} />
                </CardBody>
              </Card>
            </TouchableOpacity>

            {/* Mute broadcasts */}
            <Card>
              <CardBody className="flex-row items-center gap-4">
                <IconChip name={muted ? 'volume-mute' : 'megaphone-outline'} />
                <View className="flex-1">
                  <Text className="text-base font-semibold text-foreground">Mute broadcasts</Text>
                  <Text className="mt-0.5 text-xs leading-5 text-muted">
                    Stop dispatcher announcements from notifying you.
                  </Text>
                </View>
                <Switch
                  value={muted}
                  onValueChange={setMuted}
                  trackColor={{ false: palette.border, true: palette.primary }}
                  thumbColor="#ffffff"
                  ios_backgroundColor={palette.border}
                  accessibilityLabel="Mute broadcasts"
                />
              </CardBody>
            </Card>
          </View>
        </View>

        {/* Sign out */}
        <TouchableOpacity
          onPress={confirmSignOut}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          className="flex-row items-center justify-center gap-2 rounded-2xl border border-red-500/40 bg-red-500/5 py-4"
        >
          <Ionicons name="log-out-outline" size={20} color="#ef4444" />
          <Text className="text-base font-semibold text-red-500">Sign out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
