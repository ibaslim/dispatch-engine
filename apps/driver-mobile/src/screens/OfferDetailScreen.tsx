import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { Button, Card, CardBody, Ref } from '@components/ui';
import { RouteLine } from '@components/orders';
import { countdownColor } from '@constants/colors';
import { PUBLISH_WINDOW_SECONDS, type PublishedOrder } from '@contexts';
import { useTheme } from '@theme';

interface Props {
  /** Undefined once the offer leaves the pool — claimed, expired or withdrawn. */
  order: PublishedOrder | undefined;
  accepting: boolean;
  onAccept: () => void;
  onBack: () => void;
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="mb-3 text-[11px] font-bold uppercase tracking-[1px] text-muted">
      {children}
    </Text>
  );
}

function formatUsd(amount: number | null): string {
  return `$${(amount ?? 0).toFixed(2)}`;
}

function countdownLabel(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

/** One stop's schedule, as dispatch entered it. */
function Schedule({ role, date, time }: { role: string; date: string; time: string }) {
  return (
    <View className="flex-1">
      <Text className="text-[11px] font-bold uppercase tracking-wider text-muted">{role}</Text>
      <Text className="mt-1 text-[15px] font-semibold text-foreground">{date || '—'}</Text>
      <Text className="text-[13px] text-muted">{time || '—'}</Text>
    </View>
  );
}

/**
 * A broadcast offer in full, so the driver can judge it before claiming it.
 *
 * Deliberately not the assigned-job detail screen: navigation, contact numbers,
 * progress advance, POD and incident reporting all belong to a job you hold —
 * the API rejects them for an order that isn't yours — and none of them help
 * answer the only question here, which is whether to take it.
 *
 * Contact details are withheld for the same reason: an unclaimed order's sender
 * and recipient are not yet this driver's to call.
 */
export function OfferDetailScreen({ order, accepting, onAccept, onBack }: Props) {
  const { palette } = useTheme();

  if (!order) {
    return (
      <SafeAreaView
        edges={['top']}
        className="flex-1 items-center justify-center gap-3 bg-background"
      >
        <Text className="text-base font-semibold text-foreground">Offer no longer available</Text>
        <Text className="px-10 text-center text-sm text-muted">
          Another driver accepted it, or the 15-minute window closed.
        </Text>
        <Button title="Back to available" variant="outline" onPress={onBack} />
      </SafeAreaView>
    );
  }

  const percent = Math.round((order.remainingSeconds / PUBLISH_WINDOW_SECONDS) * 100);
  const barColor = countdownColor(percent);
  const hasBreakdown =
    order.driver_fee_payout !== null || order.driver_tip_payout !== null;

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
        <View className="flex-1">
          <Text className="text-xl font-bold text-foreground">
            Order {order.order_number ?? '—'}
          </Text>
        </View>
        <View
          className="rounded-full px-3 py-1"
          style={{ backgroundColor: `${barColor}22` }}
          accessibilityLabel={`${countdownLabel(order.remainingSeconds)} left to accept`}
        >
          <Text className="text-[13px] font-bold" style={{ color: barColor }}>
            {countdownLabel(order.remainingSeconds)}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerClassName="gap-6 px-5 pb-10" showsVerticalScrollIndicator={false}>
        <Card>
          <CardBody className="gap-3">
            <View className="flex-row items-end justify-between">
              <View>
                <SectionLabel>You earn</SectionLabel>
                <Text className="text-3xl font-black text-primary">
                  {formatUsd(order.driver_payout)}
                </Text>
              </View>
              <Ref>{order.order_number ?? '—'}</Ref>
            </View>
            {hasBreakdown && (
              <View className="gap-1 border-t border-border pt-3">
                <View className="flex-row justify-between">
                  <Text className="text-[13px] text-muted">Delivery fee</Text>
                  <Text className="text-[13px] text-foreground">
                    {formatUsd(order.driver_fee_payout)}
                  </Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-[13px] text-muted">Tip</Text>
                  <Text className="text-[13px] text-foreground">
                    {formatUsd(order.driver_tip_payout)}
                  </Text>
                </View>
              </View>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardBody className="gap-5">
            <View>
              <SectionLabel>Route</SectionLabel>
              <RouteLine pickup={order.pickup_address} drop={order.delivery_address} />
            </View>
            <View className="h-px bg-border" />
            <View className="flex-row gap-4">
              <Schedule role="Pickup" date={order.pickup_date} time={order.pickup_time} />
              <Schedule role="Drop" date={order.delivery_date} time={order.delivery_time} />
            </View>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="gap-5">
            <View>
              <SectionLabel>Order breakdown</SectionLabel>
              {order.items.length === 0 ? (
                <Text className="text-[15px] text-muted">No items listed.</Text>
              ) : (
                <View className="gap-1.5">
                  {order.items.map((item, index) => (
                    <Text key={`${item.itemName}-${index}`} className="text-[15px] text-foreground">
                      {item.itemQty}x {item.itemName}
                    </Text>
                  ))}
                </View>
              )}
            </View>
            {order.instructions ? (
              <>
                <View className="h-px bg-border" />
                <View>
                  <SectionLabel>Instructions</SectionLabel>
                  <Text className="text-[15px] leading-5 text-foreground">
                    {order.instructions}
                  </Text>
                </View>
              </>
            ) : null}
          </CardBody>
        </Card>

        <View className="gap-2">
          <View className="h-1.5 overflow-hidden rounded-full bg-input">
            <View
              className="h-full rounded-full"
              style={{ width: `${Math.max(2, percent)}%`, backgroundColor: barColor }}
            />
          </View>
          <Text className="text-center text-[12px] text-muted">
            Contact details unlock once you accept.
          </Text>
        </View>

        <Button title="Accept order" loading={accepting} onPress={onAccept} />
      </ScrollView>
    </SafeAreaView>
  );
}