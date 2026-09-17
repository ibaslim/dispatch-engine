import React from 'react';
import { View, Text } from 'react-native';

import { Card, CardBody } from '@components/ui';
import {
  formatRelativeStop,
  formatStopDate,
  formatStopTime,
  minutesUntilStop,
  stopCountdownTint,
} from '@utils/schedule';

interface Props {
  pickupPlannedAt: string;
  pickupTimeSpecified: boolean;
  deliveryPlannedAt: string;
  deliveryTimeSpecified: boolean;
}

/** Centres a node on the first line of text beside it, same offset as RouteLine's. */
const NODE_OFFSET = { marginTop: 4 };

function ScheduleNode({
  variant,
  label,
  plannedAt,
  timeSpecified,
  isLast,
}: {
  variant: 'pickup' | 'drop';
  label: string;
  plannedAt: string;
  timeSpecified: boolean;
  isLast: boolean;
}) {
  const time = formatStopTime(plannedAt, timeSpecified);
  const minutes = timeSpecified ? minutesUntilStop(plannedAt, timeSpecified) : null;
  const tint = minutes != null ? stopCountdownTint(minutes) : null;

  return (
    <View className="flex-row gap-3">
      <View className="items-center">
        {variant === 'pickup' ? (
          <View className="h-2.5 w-2.5 rounded-full bg-primary" style={NODE_OFFSET} />
        ) : (
          <View className="h-2.5 w-2.5 rounded-[3px] bg-foreground" style={NODE_OFFSET} />
        )}
        {!isLast && <View className="mt-1 w-px flex-1 bg-border" />}
      </View>
      <View className={isLast ? 'flex-1 flex-row items-start justify-between' : 'flex-1 flex-row items-start justify-between pb-4'}>
        <View>
          <Text className="text-[11px] font-semibold uppercase tracking-[0.5px] text-muted">
            {label}
          </Text>
          {time ? (
            <View className="mt-0.5 flex-row items-baseline gap-1.5">
              <Text className="text-lg font-bold leading-6 text-foreground">{time}</Text>
              <Text className="text-[13px] text-muted">{formatStopDate(plannedAt)}</Text>
            </View>
          ) : (
            <Text className="mt-0.5 text-lg font-medium leading-6 text-muted">Any time</Text>
          )}
        </View>
        {minutes != null && tint ? (
          <View className="mt-0.5 rounded-full px-2.5 py-1" style={{ backgroundColor: tint.background }}>
            <Text className="text-[11px] font-semibold" style={{ color: tint.color }}>
              {formatRelativeStop(minutes)}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/**
 * The job's two time windows, read top to bottom like the address timeline
 * below it — same pickup-dot / drop-square nodes as `RouteLine`, so a driver
 * scanning the screen reads "when" with the same shape language as "where".
 * Renders nothing for an unscheduled order (neither leg has a set time).
 */
export function ScheduleCard({
  pickupPlannedAt,
  pickupTimeSpecified,
  deliveryPlannedAt,
  deliveryTimeSpecified,
}: Props) {
  if (!pickupTimeSpecified && !deliveryTimeSpecified) return null;

  return (
    <Card>
      <CardBody className="gap-1">
        <Text className="mb-2 text-[11px] font-bold uppercase tracking-[1px] text-muted">
          Scheduled At
        </Text>
        <ScheduleNode
          variant="pickup"
          label="Pickup"
          plannedAt={pickupPlannedAt}
          timeSpecified={pickupTimeSpecified}
          isLast={false}
        />
        <ScheduleNode
          variant="drop"
          label="Drop"
          plannedAt={deliveryPlannedAt}
          timeSpecified={deliveryTimeSpecified}
          isLast
        />
      </CardBody>
    </Card>
  );
}
