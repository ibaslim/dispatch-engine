import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@theme';
import type { RoutePlan } from '@dispatch/shared/contracts';
import { formatDistance } from '@utils/distance';
import { formatDuration } from '@utils/duration';

interface Props {
  plan: RoutePlan;
  onPress: () => void;
}

/**
 * The driver's whole run in one line, above the order list.
 *
 * Deliberately not a card of stats: the only question it answers is "is there a
 * better order than the one I'd pick myself", so it shows the size of the run
 * and gets out of the way.
 */
export function RoutePlanCard({ plan, onPress }: Props) {
  const { palette } = useTheme();

  const count = plan.stops.length;
  const duration =
    plan.total_duration_seconds != null ? formatDuration(plan.total_duration_seconds) : null;
  const distance =
    plan.total_distance_meters != null
      ? formatDistance(plan.total_distance_meters / 1000)
      : null;

  const summary = duration && distance ? `${duration} over ${distance}` : duration ?? distance;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`Your run, ${count} stops${summary ? `, ${summary}` : ''}, view order`}
      className="flex-row items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5"
    >
      <View className="h-9 w-9 items-center justify-center rounded-full bg-primary-muted">
        <Ionicons name="git-branch-outline" size={18} color={palette.primary} />
      </View>
      <View className="flex-1">
        <Text className="text-[15px] font-bold text-foreground">
          {count} stops in the best order
        </Text>
        {summary ? <Text className="text-[13px] text-muted">{summary}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={palette.muted} />
    </TouchableOpacity>
  );
}
