import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

import { Button, Card, CardBody, Ref } from '@components/ui';
import { countdownColor } from '@constants/colors';
import { PUBLISH_WINDOW_SECONDS, type PublishedOrder } from '@contexts';
import { RouteLine } from './RouteLine';

interface Props {
  order: PublishedOrder;
  accepting: boolean;
  /** Open the full offer. */
  onPress: () => void;
  onAccept: () => void;
}

/** mm:ss for the countdown label. */
function countdownLabel(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function formatUsd(amount: number | null): string {
  return `$${(amount ?? 0).toFixed(2)}`;
}

/**
 * One unclaimed broadcast offer.
 *
 * Separate from `OrderCard` on purpose: that card carries contact and report
 * actions that only exist once a job is assigned, and this one carries a
 * deadline. Merging them would mean a card of mutually exclusive branches.
 */
export function PublishedOrderCard({ order, accepting, onPress, onAccept }: Props) {
  const percent = Math.round((order.remainingSeconds / PUBLISH_WINDOW_SECONDS) * 100);

  return (
    <Card>
      <CardBody className="gap-4">
        {/* The body is tappable as well as the Details button — the button is
            the discoverable affordance, the whole card is the easy target for
            a thumb. A press on either button is handled there and never
            reaches this one. */}
        <TouchableOpacity
          onPress={onPress}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Offer ${order.order_number ?? ''}, ${formatUsd(
            order.driver_payout,
          )}, view details`}
          className="gap-4"
        >
          <View className="flex-row items-start justify-between gap-3">
            <View className="gap-1">
              <Ref>{order.order_number ?? '—'}</Ref>
              <Text className="text-[11px] font-bold uppercase tracking-wider text-muted">
                New offer
              </Text>
            </View>
            <Text className="text-xl font-black text-primary">
              {formatUsd(order.driver_payout)}
            </Text>
          </View>

          <RouteLine pickup={order.pickup_address} drop={order.delivery_address} />

          <View className="gap-1.5">
            <View className="flex-row items-center justify-between">
              <Text className="text-[11px] font-bold uppercase tracking-wider text-muted">
                Time to accept
              </Text>
              <Text className="text-[13px] font-bold text-foreground">
                {countdownLabel(order.remainingSeconds)}
              </Text>
            </View>
            <View className="h-1.5 overflow-hidden rounded-full bg-input">
              <View
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(2, percent)}%`,
                  backgroundColor: countdownColor(percent),
                }}
              />
            </View>
          </View>
        </TouchableOpacity>

        <View className="flex-row gap-3">
          <Button title="Details" variant="outline" className="flex-1" onPress={onPress} />
          <Button
            title="Accept"
            className="flex-1"
            loading={accepting}
            onPress={onAccept}
          />
        </View>
      </CardBody>
    </Card>
  );
}