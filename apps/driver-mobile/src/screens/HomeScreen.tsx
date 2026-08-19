import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  Switch,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth, useOnlineStatus, useOrders } from '@contexts';
import { useMuteBroadcasts } from '@hooks';
import { BottomSheet, Button, Card, useToast } from '@components/ui';
import {
  ACCENT,
  ACCENT_SOFT,
  DANGER,
  SUCCESS,
  SUCCESS_SOFT,
  WARNING,
  WARNING_SOFT,
  dangerSurface,
} from '@constants/colors';
import { useTheme } from '@theme';
import type { DriverOrder } from '@types';
import {
  backgroundPermissionHint,
  backgroundPermissionPath,
  openLocationSettings,
} from '@services/driver';
import { goOnlineBlockedMessage, needsSettingsTrip, offlineReasonCopy } from '@utils/shift';
import HERO from '../../assets/images/hero.png';

/** The artwork's own ratio — keeps the scooter from stretching at any width. */
const HERO_RATIO = 1536 / 1024;

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

/** Everything due today — delivered or not — so the count reads as "the shift". */
function scheduledToday(orders: DriverOrder[]): DriverOrder[] {
  const today = todayIso();
  return orders.filter((order) => order.delivery_date?.slice(0, 10) === today);
}

function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

interface StatProps {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  soft: string;
  value: string;
  label: string;
}

function Stat({ icon, color, soft, value, label }: StatProps) {
  return (
    <View className="flex-1 items-center px-1">
      <View
        className="h-12 w-12 items-center justify-center rounded-full"
        style={{ backgroundColor: soft }}
      >
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <Text
        className="mt-2 text-lg font-black text-foreground"
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      <Text className="mt-0.5 text-[11px] text-muted" numberOfLines={1}>
        {label}
      </Text>
    </View>
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

/**
 * The landing screen after sign-in. Shows daily stats and the toggle to go on/off shift.
 *
 * Going online/offline switches the layout between an active screen and a
 * standby screen; when online, the driver receives web socket updates when new
 * orders are flowing. Going offline for a location reason (denied/revoked)
 * also raises a blocking sheet, per the shift-gated flow in the design doc.
 */
export function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { online, offlineReason, isRestoring, goOnline, goOffline } = useOnlineStatus();
  const { orders, inProgress } = useOrders();
  const { muted, setMuted, reload } = useMuteBroadcasts();
  const { show } = useToast();
  const { scheme, palette } = useTheme();
  const { width } = useWindowDimensions();

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
    if (offlineReason !== 'manual' || !promptedRef.current) {
      promptedRef.current = true;
      setSheetVisible(true);
    }
  }, [isRestoring, online, offlineReason]);

  async function handleGoOnline() {
    setGoingOnline(true);
    try {
      const result = await goOnline();
      if (result !== 'online') {
        show(goOnlineBlockedMessage(result), { variant: 'error' });
      }
    } finally {
      setGoingOnline(false);
    }
  }

  function toggleShift(next: boolean) {
    if (next) {
      handleGoOnline();
    } else {
      goOffline();
    }
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    show(next ? 'Broadcast alerts muted' : 'Broadcast alerts on');
  }

  const doneToday = completedToday(orders);
  const earnedToday = doneToday.reduce((sum, order) => sum + (order.driver_payout ?? 0), 0);

  // First name only — a full name wraps or truncates beside the artwork.
  const firstName = user?.name.trim().split(' ')[0] || 'Driver';

  const heroWidth = Math.min(width * 0.52, 250);
  // Anything other than a deliberate "go offline" needs explaining, and that
  // explanation lives in its own card so the shift toggle stays one clean row.
  const blocked = !online && offlineReason !== 'manual';

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <ScrollView contentContainerClassName="pb-8" showsVerticalScrollIndicator={false}>

        {/* The artwork bleeds up past the header row, as in the design. */}
        <View className="flex-row  px-5 pt-6">
          <View className="flex-1 pt-0 pr-2">
            <Text className="text-lg text-foreground">{greeting()} 👋</Text>
            <Text className=" text-2xl font-black text-foreground" numberOfLines={1}>
              {firstName}
            </Text>
            <Text className=" text-[15px] text-muted">
              {online ? 'Ready to deliver' : 'Not receiving orders'}
            </Text>
          </View>
          <Image
            source={HERO}
            style={{ width: heroWidth, height: heroWidth / HERO_RATIO, marginTop: -28 }}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
        </View>

        <Card className="mx-5 mt-[-6px]">
          <View className="flex-row items-center p-4">
            <View className="flex-1 pr-3">
              <Text className="text-[15px] font-bold text-foreground">
                You are{' '}
                <Text style={{ color: online ? palette.primary : DANGER }}>
                  {online ? 'Online' : 'Offline'}
                </Text>
              </Text>
              <Text className="mt-0 text-[13px] leading-3 text-muted">
                {online
                  ? 'You are receiving new orders'
                  : 'Go online to receive new orders'}
              </Text>
            </View>
            <View className="flex-row items-center gap-2">
              {goingOnline ? (
                <ActivityIndicator color={palette.primary} />
              ) : (
                <Switch
                  value={online}
                  onValueChange={toggleShift}
                  disabled={isRestoring}
                  trackColor={{ false: palette.border, true: palette.primary }}
                  thumbColor="#ffffff"
                  ios_backgroundColor={palette.border}
                  accessibilityLabel={online ? 'Go offline' : 'Go online'}
                />
              )}
              <Text className="text-[15px] font-bold text-foreground">
                {online ? 'Go Offline' : 'Go Online'}
              </Text>
            </View>
          </View>
        </Card>

        {blocked && (
          <Card className="mx-5 mt-4" style={dangerSurface(scheme)}>
            <View className="gap-2 p-4">
              <View className="flex-row items-center gap-2">
                <Ionicons name="alert-circle" size={18} color={DANGER} />
                <Text className="flex-1 text-[15px] font-bold" style={{ color: DANGER }}>
                  {offlineReason === 'background_permission'
                    ? 'Always-on location required'
                    : 'Location required'}
                </Text>
              </View>
              <Text className="text-[13px] leading-5 text-foreground/80">
                {offlineReasonCopy(offlineReason)}
              </Text>
              {offlineReason === 'background_permission' && (
                <>
                  <SettingsBreadcrumb segments={backgroundPermissionPath()} color={DANGER} />
                  <Text className="text-[12px] leading-4 text-muted">
                    {backgroundPermissionHint()}
                  </Text>
                </>
              )}
              {needsSettingsTrip(offlineReason) && (
                <Button
                  title="Open settings"
                  variant="outline"
                  size="sm"
                  onPress={openLocationSettings}
                />
              )}
            </View>
          </Card>
        )}

        <Card className="mx-5 mt-4">
          <View className="flex-row py-4">
            <Stat
              icon="clipboard-outline"
              color={palette.primary}
              soft={palette['primary-muted']}
              value={String(scheduledToday(orders).length)}
              label="Today's Orders"
            />
            <View className="my-2 w-px bg-border" />
            <Stat
              icon="bag-check-outline"
              color={SUCCESS}
              soft={SUCCESS_SOFT}
              value={String(doneToday.length)}
              label="Completed"
            />
            <View className="my-2 w-px bg-border" />
            <Stat
              icon="time-outline"
              color={WARNING}
              soft={WARNING_SOFT}
              value={String(inProgress.length)}
              label="In Progress"
            />
            <View className="my-2 w-px bg-border" />
            <Stat
              icon="cash-outline"
              color={ACCENT}
              soft={ACCENT_SOFT}
              value={formatUsd(earnedToday)}
              label="Today's Earning"
            />
          </View>
        </Card>
      </ScrollView>

      <BottomSheet visible={sheetVisible} onClose={() => setSheetVisible(false)}>
        <View className="gap-3 px-5 pb-2 pt-1">
          <View className="flex-row items-center gap-3">
            <Ionicons name="close-circle-outline" size={26} color={DANGER} />
            <Text className="flex-1 text-xl font-bold text-foreground">
              {offlineReason === 'background_permission'
                ? 'Always-on location required'
                : 'Location required to go online'}
            </Text>
          </View>
          <Text className="text-sm leading-5 text-muted">
            {offlineReason === 'background_permission'
              ? 'Dispatch Engine Driver shares your position while you drive, with the screen off. Android only allows that with “Allow all the time”, which has to be set in Settings.'
              : offlineReason === 'services_disabled'
                ? 'Device location services are turned off. Dispatch Engine Driver needs it to match you with nearby orders and share live tracking while you\'re online.'
                : 'Location access was denied or turned off. Dispatch Engine Driver needs it to match you with nearby orders and share live tracking while you\'re online.'}
          </Text>
          {offlineReason === 'background_permission' && (
            <View className="gap-2">
              <SettingsBreadcrumb segments={backgroundPermissionPath()} color={DANGER} />
              <Button title="Open settings" variant="outline" onPress={openLocationSettings} />
            </View>
          )}
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