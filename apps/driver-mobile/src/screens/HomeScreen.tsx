import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth, useOnlineStatus, useOrders } from '@contexts';
import { useMuteBroadcasts } from '@hooks';
import { BottomSheet, Button, Card, useToast } from '@components/ui';
import { DANGER, dangerSurface } from '@constants/colors';
import { useTheme } from '@theme';
import type { DriverOrder } from '@types';
import * as Location from 'expo-location';
import {
  backgroundPermissionHint,
  backgroundPermissionPath,
  openLocationSettings,
} from '@services/driver';

/** Local calendar date as YYYY-MM-DD, for comparing against order dates. */
function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Orders delivered on today's calendar date (the "today snapshot" bucket). */
function completedToday(orders: DriverOrder[]): DriverOrder[] {
  const today = todayIso();
  return orders.filter(
    (order) =>
      order.activity_status === 'delivered' && order.delivery_date?.slice(0, 10) === today,
  );
}

function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

interface StatCardProps {
  value: string;
  label: string;
  accent?: boolean;
}

function StatCard({ value, label, accent }: StatCardProps) {
  return (
    <Card className="flex-1">
      <View className="items-center py-4">
        <Text
          className={`text-2xl font-black ${accent ? 'text-primary' : 'text-foreground'}`}
        >
          {value}
        </Text>
        <Text className="mt-1 text-[11px] font-bold uppercase tracking-wider text-muted">
          {label}
        </Text>
      </View>
    </Card>
  );
}

/**
 * A Settings path drawn as breadcrumbs with real chevron glyphs.
 *
 * The separator is an Ionicons `chevron-forward` rather than a literal "→": the
 * arrow character is missing from the default Android system font, which
 * silently substitutes a fallback letter.
 */
function SettingsBreadcrumb({ segments, color }: { segments: string[]; color: string }) {
  return (
    <View className="flex-row flex-wrap items-center">
      {segments.map((segment, index) => (
        <React.Fragment key={segment}>
          {index > 0 && (
            <Ionicons name="chevron-forward" size={11} color={color} style={{ marginHorizontal: 3 }} />
          )}
          <Text className="text-[12px] font-semibold" style={{ color }}>
            {segment}
          </Text>
        </React.Fragment>
      ))}
    </View>
  );
}

function MutedPill() {
  return (
    <View className="rounded bg-muted px-2 py-0.5">
      <Text className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        Muted
      </Text>
    </View>
  );
}

/**
 * The landing screen after sign-in. Shows daily stats and the toggle to go on/off shift.
 *
 * Going online/offline switches the layout between an active screen and a
 * standby screen; when online, the driver receives web socket updates when new
 * orders are flowing. Going offline for a location reason (denied/revoked)
 * also raises a blocking sheet, per the shift-gated flow in the design doc.
 */
export function HomeScreen() {
  const { user } = useAuth();
  const { online, offlineReason, isRestoring, backgroundTracking, goOnline, goOffline } =
    useOnlineStatus();
  const { orders, inProgress } = useOrders();
  const { muted, reload } = useMuteBroadcasts();
  const { show } = useToast();
  const { scheme } = useTheme();

  const [sheetVisible, setSheetVisible] = useState(false);
  const [goingOnline, setGoingOnline] = useState(false);
  const promptedRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  // Raise the location/offline sheet when the driver lands here offline, and
  // whenever a permission loss or location services disable forces them offline.
  useEffect(() => {
    if (isRestoring) return;
    if (online) {
      promptedRef.current = false;
      setSheetVisible(false);
      return;
    }
    if (offlineReason === 'permission' || offlineReason === 'services_disabled' || !promptedRef.current) {
      promptedRef.current = true;
      setSheetVisible(true);
    }
  }, [isRestoring, online, offlineReason]);

  async function handleGoOnline() {
    setGoingOnline(true);
    try {
      const success = await goOnline();
      if (!success) {
        const { granted } = await Location.getForegroundPermissionsAsync();
        if (!granted) {
          show('Allow location access in your device settings to go online.', {
            variant: 'error',
          });
        } else {
          show('Please turn on your device location services to go online.', {
            variant: 'error',
          });
        }
      }
    } finally {
      setGoingOnline(false);
    }
  }

  // Online but without background permission: the driver is tracked only while
  // this screen is up, which is not what "Online" implies — say so explicitly.
  const backgroundOnly =
    online && (backgroundTracking === 'needs-settings' || backgroundTracking === 'denied');

  const doneToday = completedToday(orders);
  const earnedToday = doneToday.reduce((sum, order) => sum + (order.driver_payout ?? 0), 0);

  const firstName = user?.name.split(' ')[0];

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <ScrollView
        contentContainerClassName="gap-4 p-5 pb-8"
        showsVerticalScrollIndicator={false}
      >
        <View>
          <Text className="text-3xl font-bold text-foreground">Home</Text>
          <Text className="mt-1 text-sm text-muted">
            {online
              ? firstName
                ? `Ready to roll, ${firstName}.`
                : 'Ready to roll.'
              : 'Go online when you are ready.'}
          </Text>
        </View>

        {online ? (
          <View className="gap-3 rounded-2xl border border-primary bg-primary-muted p-5">
            <View className="flex-row items-center gap-2">
              <View className="h-2.5 w-2.5 rounded-full bg-primary" />
              <Text className="flex-1 text-lg font-bold text-primary">You&apos;re Online</Text>
              {muted && <MutedPill />}
            </View>
            <Text className="text-sm leading-5 text-primary-muted-foreground">
              You&apos;re receiving new orders. Keep location sharing on to stay online.
            </Text>
            {backgroundOnly ? (
              <View className="gap-2 rounded-xl p-3" style={dangerSurface(scheme)}>
                <View className="flex-row items-center gap-2">
                  <Ionicons name="warning-outline" size={16} color={DANGER} />
                  <Text className="flex-1 text-[13px] font-bold" style={{ color: DANGER }}>
                    Tracking stops when your screen turns off
                  </Text>
                </View>
                <SettingsBreadcrumb segments={backgroundPermissionPath()} color={DANGER} />
                <Text className="text-[12px] leading-4 text-muted">
                  {backgroundPermissionHint()}
                </Text>
                <Button
                  title="Open settings"
                  variant="outline"
                  size="sm"
                  onPress={openLocationSettings}
                />
              </View>
            ) : null}
            <View className="flex-row items-center justify-between">
              <Text className="text-[13px] text-primary-muted-foreground">
                {backgroundOnly ? 'Location: foreground only' : 'Location: active'}
              </Text>
              <Button title="Go Offline" variant="outline" size="sm" onPress={goOffline} />
            </View>
          </View>
        ) : (
          <View className="gap-3 rounded-2xl border p-5" style={dangerSurface(scheme)}>
            <View className="flex-row items-center gap-2">
              <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: DANGER }} />
              <Text className="flex-1 text-lg font-bold" style={{ color: DANGER }}>
                You&apos;re Offline
              </Text>
              {muted && <MutedPill />}
            </View>
            <Text className="text-sm leading-5 text-foreground/80">
              {offlineReason === 'permission'
                ? 'Location access was denied or lost, so you were taken offline automatically. Allow location to go back online.'
                : offlineReason === 'services_disabled'
                  ? 'Device location services are turned off, so you were taken offline automatically. Turn on location to go back online.'
                  : 'You are not receiving new orders. Go online to start your shift.'}
            </Text>
            <Button title="Go Online" loading={goingOnline} onPress={handleGoOnline} />
          </View>
        )}

        <View className="flex-row gap-3">
          <StatCard value={formatUsd(earnedToday)} label="Earned today" accent />
          <StatCard value={String(doneToday.length)} label="Completed today" />
          <StatCard value={String(inProgress.length)} label="Active orders" />
        </View>
      </ScrollView>

      <BottomSheet visible={sheetVisible} onClose={() => setSheetVisible(false)}>
        <View className="gap-3 px-5 pb-2 pt-1">
          <View className="flex-row items-center gap-3">
            <Ionicons name="close-circle-outline" size={26} color={DANGER} />
            <Text className="flex-1 text-xl font-bold text-foreground">
              Location required to go online
            </Text>
          </View>
          <Text className="text-sm leading-5 text-muted">
            {offlineReason === 'services_disabled'
              ? 'Device location services are turned off. Dispatch Engine Driver needs it to match you with nearby orders and share live tracking while you\'re online.'
              : 'Location access was denied or turned off. Dispatch Engine Driver needs it to match you with nearby orders and share live tracking while you\'re online.'}
          </Text>
          <View className="mt-1 gap-1">
            <Button title="Go Online" loading={goingOnline} onPress={handleGoOnline} />
            <Button
              title="Not now — browse the app"
              variant="ghost"
              onPress={() => setSheetVisible(false)}
            />
          </View>
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}
