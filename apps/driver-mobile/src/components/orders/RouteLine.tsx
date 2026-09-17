import React from 'react';
import { View, Text } from 'react-native';

import { formatDistance } from '@utils/distance';
import { formatDuration } from '@utils/duration';
import { StopTime } from './StopTime';

interface Props {
  pickup: string;
  drop: string;
  /** Quoted pickup-to-drop leg. Both are optional — older orders carry neither. */
  distanceMeters?: number | null;
  durationSeconds?: number | null;
  /** Planned stop times. Omit both to leave the address lines bare, as before. */
  pickupPlannedAt?: string;
  pickupTimeSpecified?: boolean;
  deliveryPlannedAt?: string;
  deliveryTimeSpecified?: boolean;
}

/** Centres a 10px node on the first 20px line of text beside it. */
const NODE_OFFSET = { marginTop: 5 };

/** One phrase rather than two figures, so it can't be read as a pair of unrelated stats. */
function legLabel(
  distanceMeters?: number | null,
  durationSeconds?: number | null,
): string | null {
  const time = durationSeconds != null ? formatDuration(durationSeconds) : null;
  const span = distanceMeters != null ? formatDistance(distanceMeters / 1000) : null;
  if (time && span) return `${time} over ${span}`;
  return time ?? span;
}

export function RouteLine({
  pickup,
  drop,
  distanceMeters,
  durationSeconds,
  pickupPlannedAt,
  pickupTimeSpecified,
  deliveryPlannedAt,
  deliveryTimeSpecified,
}: Props) {
  const leg = legLabel(distanceMeters, durationSeconds);

  return (
    <View>
      <View className="flex-row gap-3">
        <View className="items-center">
          <View className="h-2.5 w-2.5 rounded-full bg-primary" style={NODE_OFFSET} />
          <View className="mt-1 w-px flex-1 bg-border" />
        </View>
        <View className="flex-1 pb-3">
          <Text className="text-sm leading-5 text-foreground">{pickup}</Text>
          {pickupPlannedAt != null && (
            <StopTime plannedAt={pickupPlannedAt} timeSpecified={Boolean(pickupTimeSpecified)} />
          )}
        </View>
      </View>

      {leg ? (
        // Rides the connector: its position states that it measures pickup to drop, not the run out to pickup.
        <View className="flex-row gap-3">
          <View className="w-2.5 items-center">
            <View className="w-px flex-1 bg-border" />
          </View>
          <Text
            className="flex-1 pb-3 text-[12px] leading-4 text-muted"
            accessibilityLabel={`Pickup to drop, ${leg}`}
          >
            {leg}
          </Text>
        </View>
      ) : null}

      <View className="flex-row gap-3">
        <View className="items-center">
          <View className="h-2.5 w-2.5 rounded-[3px] bg-foreground" style={NODE_OFFSET} />
        </View>
        <View className="flex-1">
          <Text className="text-sm leading-5 text-muted">{drop}</Text>
          {deliveryPlannedAt != null && (
            <StopTime plannedAt={deliveryPlannedAt} timeSpecified={Boolean(deliveryTimeSpecified)} />
          )}
        </View>
      </View>
    </View>
  );
}
