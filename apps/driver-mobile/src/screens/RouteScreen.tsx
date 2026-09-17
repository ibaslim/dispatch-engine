import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Clipboard,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { Button, Card, CardBody, useToast } from '@components/ui';
import { useRoutePlan } from '@hooks';
import { useTheme } from '@theme';
import type { RouteStop, UnplaceableStop } from '@dispatch/shared/contracts';
import { formatDistance } from '@utils/distance';
import { formatDuration } from '@utils/duration';
import {
  MAX_STOPS_PER_LAUNCH,
  buildRouteUrl,
  canOpenRoute,
  openDirections,
  openRoute,
} from '@utils/linking';

interface Props {
  onBack: () => void;
  onStopPress: (orderId: string) => void;
}

/** Pickups and drops read differently at a glance; the shape carries the difference. */
function StopMarker({ stop }: { stop: RouteStop }) {
  const isPickup = stop.kind === 'pickup';
  return (
    <View className="items-center">
      <View
        className={`h-7 w-7 items-center justify-center ${
          isPickup ? 'rounded-full bg-primary' : 'rounded-md bg-foreground'
        }`}
      >
        <Text className="text-[12px] font-black text-background">{stop.sequence}</Text>
      </View>
    </View>
  );
}

function StopRow({
  stop,
  isLast,
  inFirstLaunch,
  onPress,
}: {
  stop: RouteStop;
  isLast: boolean;
  inFirstLaunch: boolean;
  onPress: () => void;
}) {
  const leg = stop.leg_duration_seconds != null ? formatDuration(stop.leg_duration_seconds) : null;
  const span =
    stop.leg_distance_meters != null ? formatDistance(stop.leg_distance_meters / 1000) : null;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Stop ${stop.sequence}, ${stop.kind === 'pickup' ? 'pickup' : 'drop'} for order ${
        stop.order_number ?? ''
      }, ${stop.address ?? ''}`}
      className={`flex-row gap-3 ${inFirstLaunch ? '' : 'opacity-50'}`}
    >
      <View className="items-center">
        <StopMarker stop={stop} />
        {!isLast && <View className="mt-1 w-px flex-1 bg-border" />}
      </View>

      <View className={`flex-1 ${isLast ? '' : 'pb-5'}`}>
        <View className="flex-row items-center gap-2">
          <Text className="text-[13px] font-bold text-foreground">
            {stop.kind === 'pickup' ? 'Pick up' : 'Drop'}
          </Text>
          <Text className="text-[13px] text-muted">{stop.order_number ?? '—'}</Text>
        </View>
        <Text className="mt-0.5 text-sm leading-5 text-foreground">{stop.address ?? '—'}</Text>
        {stop.name ? <Text className="text-[13px] text-muted">{stop.name}</Text> : null}
        {leg ? (
          <Text className="mt-1 text-[12px] text-muted">
            {span ? `${leg} over ${span} to get here` : `${leg} to get here`}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

function UnplaceableRow({ item }: { item: UnplaceableStop }) {
  return (
    <View className="gap-0.5">
      <Text className="text-[13px] font-bold text-foreground">{item.order_number ?? '—'}</Text>
      <Text className="text-[13px] text-muted">
        {item.address ? `${item.address} has no map location.` : 'This order has no address.'}
      </Text>
    </View>
  );
}

/**
 * The driver's stops in the order that covers them with the least driving.
 *
 * Showing the sequence before handing it to Maps is the point: a driver who
 * can't see why stop 3 comes before stop 1 won't trust the order enough to
 * follow it.
 */
export function RouteScreen({ onBack, onStopPress }: Props) {
  const { palette } = useTheme();
  const { show } = useToast();
  const { plan, isLoading, error } = useRoutePlan();
  const [multiStopSupported, setMultiStopSupported] = useState(true);

  useEffect(() => {
    canOpenRoute().then(setMultiStopSupported);
  }, []);

  const stops = plan?.stops ?? [];
  const overflow = Math.max(0, stops.length - MAX_STOPS_PER_LAUNCH);
  const mapsUrl = buildRouteUrl(stops);

  function copyLink() {
    if (!mapsUrl) return;
    Clipboard.setString(mapsUrl);
    show('Link copied. Paste it into Google Maps on the web.', { variant: 'success' });
  }

  async function launch() {
    if (stops.length === 0) return;

    if (!multiStopSupported) {
      // Apple Maps can't take a multi-stop route, so send the first stop alone.
      const first = stops[0];
      openDirections(first.address ?? '', first.latitude, first.longitude);
      show('Install Google Maps to follow the whole run in one go.');
      return;
    }

    const opened = await openRoute(stops);
    if (!opened) show('Could not open Google Maps.', { variant: 'error' });
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <View className="flex-row items-center gap-3 px-5 py-3">
        <TouchableOpacity
          onPress={onBack}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back"
          className="h-9 w-9 items-center justify-center rounded-full border border-border bg-card"
        >
          <Ionicons name="chevron-back" size={20} color={palette.foreground} />
        </TouchableOpacity>
        <Text className="flex-1 text-xl font-bold text-foreground">Your run</Text>
      </View>

      {isLoading && !plan ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={palette.primary} />
        </View>
      ) : stops.length === 0 ? (
        <View className="flex-1 items-center justify-center gap-1 px-10">
          <Text className="text-base font-semibold text-foreground">Nothing to route</Text>
          <Text className="text-center text-sm text-muted">
            {error ?? 'Accept a job and its stops appear here in driving order.'}
          </Text>
        </View>
      ) : (
        <>
          <ScrollView
            contentContainerClassName="gap-6 px-5 pb-6"
            showsVerticalScrollIndicator={false}
          >
            <Card>
              <CardBody>
                {stops.map((stop, index) => (
                  <StopRow
                    key={`${stop.order_id}-${stop.kind}`}
                    stop={stop}
                    isLast={index === stops.length - 1}
                    inFirstLaunch={index < MAX_STOPS_PER_LAUNCH}
                    onPress={() => onStopPress(stop.order_id)}
                  />
                ))}
              </CardBody>
            </Card>

            {plan?.unplaceable.length ? (
              <Card>
                <CardBody className="gap-3">
                  <Text className="text-[15px] font-bold text-foreground">Left out of the run</Text>
                  {plan.unplaceable.map((item) => (
                    <UnplaceableRow key={`${item.order_id}-${item.kind}`} item={item} />
                  ))}
                  <Text className="text-[12px] text-muted">
                    Ask dispatch to add a map location, then pull to refresh.
                  </Text>
                </CardBody>
              </Card>
            ) : null}

            {plan?.optimized_by === 'local' ? (
              <Text className="px-1 text-[12px] leading-4 text-muted">
                Times are rough estimates — live traffic was unavailable when this was planned.
              </Text>
            ) : null}
          </ScrollView>

          <View className="gap-2 px-5 pb-4">
            {mapsUrl ? (
              <View className="gap-2 rounded-xl border border-border bg-surface p-3">
                <Text className="text-[12px] font-bold text-foreground">
                  Link handed to Google Maps
                </Text>
                <Text selectable className="text-[11px] leading-4 text-muted">
                  {mapsUrl}
                </Text>
                <Button title="Copy link" variant="outline" size="sm" onPress={copyLink} />
              </View>
            ) : null}
            {overflow > 0 ? (
              <Text className="text-center text-[12px] text-muted">
                Google Maps takes {MAX_STOPS_PER_LAUNCH} stops at a time. Open it again after stop{' '}
                {MAX_STOPS_PER_LAUNCH} for the last {overflow}.
              </Text>
            ) : null}
            <Button title="Open in Google Maps" onPress={launch} />
          </View>
        </>
      )}
    </SafeAreaView>
  );
}
