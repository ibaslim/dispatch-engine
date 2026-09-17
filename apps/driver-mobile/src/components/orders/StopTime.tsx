import React from 'react';
import { View, Text } from 'react-native';

import { formatRelativeStop, formatStopTime, minutesUntilStop, stopCountdownTint } from '@utils/schedule';

/**
 * A stop's clock time plus a countdown pill, same green-to-red gradient as the
 * order detail screen's `ScheduleCard`. Renders nothing for a date-only stop —
 * "Any time" has nothing to count down to.
 */
export function StopTime({ plannedAt, timeSpecified }: { plannedAt: string; timeSpecified: boolean }) {
  if (!timeSpecified) return null;
  const time = formatStopTime(plannedAt, timeSpecified);
  const minutes = minutesUntilStop(plannedAt, timeSpecified);
  if (!time || minutes == null) return null;
  const tint = stopCountdownTint(minutes);

  return (
    <View className="mt-1 flex-row items-center gap-1.5">
      <Text className="text-[12px] font-semibold text-foreground">{time}</Text>
      <View className="rounded-full px-1.5 py-0.5" style={{ backgroundColor: tint.background }}>
        <Text className="text-[10px] font-semibold" style={{ color: tint.color }}>
          {formatRelativeStop(minutes)}
        </Text>
      </View>
    </View>
  );
}
