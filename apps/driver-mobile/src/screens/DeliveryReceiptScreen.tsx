import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@theme';
import { Button, Card, CardBody } from '@components/ui';
import { SUCCESS, SUCCESS_SOFT } from '@constants/colors';
import type { DriverOrder } from '@types';

interface Props {
  order: DriverOrder | undefined;
  onBack: () => void;
}

/** Figures are set tabular so the ledger column lines up on the decimal. */
const FIGURE = { fontVariant: ['tabular-nums' as const] };

function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="text-[11px] font-bold uppercase tracking-[1px] text-muted">{children}</Text>
  );
}

/** One line of the payout ledger: label left, figure right. */
function LedgerRow({
  label,
  amount,
  total,
}: {
  label: string;
  amount: number;
  total?: boolean;
}) {
  return (
    <View className="flex-row items-center justify-between">
      <Text
        className={total ? 'text-[15px] font-bold text-foreground' : 'text-[15px] text-muted'}
      >
        {label}
      </Text>
      <Text
        style={FIGURE}
        className={total ? 'text-[15px] font-bold text-foreground' : 'text-[15px] text-foreground'}
      >
        {formatUsd(amount)}
      </Text>
    </View>
  );
}

/**
 * One end of the route: a node on the connector, then who and where.
 * Addresses wrap in full — this is the record of where the parcel went, and a
 * truncated address is worse than useless in a dispute.
 */
function Stop({
  role,
  name,
  address,
  drop,
}: {
  role: string;
  name: string;
  address: string;
  drop?: boolean;
}) {
  return (
    <View className="flex-row gap-3">
      <View className="items-center pt-1.5">
        <View
          className={drop ? 'h-2.5 w-2.5 rounded-[3px] bg-foreground' : 'h-2.5 w-2.5 rounded-full bg-primary'}
        />
        {!drop && <View className="mt-1 w-px flex-1 bg-border" />}
      </View>
      <View className={drop ? 'flex-1' : 'flex-1 pb-5'}>
        <SectionLabel>{role}</SectionLabel>
        <Text className="mt-1 text-base font-semibold text-foreground">{name}</Text>
        <Text className="mt-0.5 text-sm leading-5 text-muted">{address}</Text>
      </View>
    </View>
  );
}

/**
 * A finished delivery, read as a receipt rather than as a job.
 *
 * Nothing here is actionable: the driving, the calling and the proof capture
 * are all behind the driver by the time they land here from Activity. What's
 * left is what a receipt is for — what they earned, where it went, and what was
 * in it — so the payout leads instead of sitting in a footnote, and the parties
 * are drawn as the route the parcel actually travelled.
 */
export function DeliveryReceiptScreen({ order, onBack }: Props) {
  const { palette } = useTheme();

  if (!order) {
    return (
      <SafeAreaView
        edges={['top']}
        className="flex-1 items-center justify-center gap-3 bg-background"
      >
        <Text className="text-base font-semibold text-foreground">Order not available</Text>
        <Text className="px-10 text-center text-sm text-muted">
          It may have been reassigned or removed.
        </Text>
        <Button title="Back to activity" variant="outline" onPress={onBack} />
      </SafeAreaView>
    );
  }

  const payout = order.driver_payout ?? 0;
  const fee = order.driver_fee_payout;
  const tip = order.driver_tip_payout;
  // Only worth a ledger when the parts are actually broken out; otherwise the
  // hero figure has already said everything there is to say.
  const hasSplit = fee !== null || tip !== null;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <View className="flex-row items-center  px-5 py-3">
        <TouchableOpacity
          onPress={onBack}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back"
          className="h-9 w-9 items-center justify-center"
        >
          <Ionicons name="chevron-back" size={20} color={palette.foreground} />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-foreground">
          {order.order_number ?? '—'}
        </Text>
      </View>

      <ScrollView contentContainerClassName="gap-4 px-5 pb-10" showsVerticalScrollIndicator={false}>
        {/* The stamp: this order is closed, and this is when it closed. */}
        <View
          className="flex-row items-center gap-2 rounded-xl px-4 py-3"
          style={{ backgroundColor: SUCCESS_SOFT }}
        >
          <Ionicons name="checkmark-circle" size={18} color={SUCCESS} />
          <Text className="text-[14px] font-bold" style={{ color: SUCCESS }}>
            Delivered {formatDate(order.delivery_date)}
          </Text>
        </View>

        <Card>
          <CardBody className="gap-4">
            <View>
              <SectionLabel>You earned</SectionLabel>
              <Text className="mt-1 text-4xl font-black text-primary" style={FIGURE}>
                {formatUsd(payout)}
              </Text>
            </View>

            {hasSplit && (
              <View className="gap-2">
                <View className="h-px bg-border" />
                {fee !== null && <LedgerRow label="Delivery fee" amount={fee} />}
                {tip !== null && <LedgerRow label="Tip" amount={tip} />}
                <View className="h-px bg-border" />
                <LedgerRow label="Total" amount={payout} total />
              </View>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <Stop
              role="Sender"
              name={order.pickup_name}
              address={order.pickup_address}
            />
            <Stop
              role="Recipient"
              name={order.delivery_name}
              address={order.delivery_address}
              drop
            />
          </CardBody>
        </Card>

        <Card>
          <CardBody className="gap-3">
            <SectionLabel>Order breakdown</SectionLabel>
            {order.items.length === 0 ? (
              <Text className="text-[15px] text-muted">No items listed.</Text>
            ) : (
              <View className="gap-2">
                {order.items.map((item, index) => (
                  <View
                    key={`${item.itemName}-${index}`}
                    className="flex-row items-baseline gap-3"
                  >
                    <Text className="text-[15px] font-semibold text-muted" style={FIGURE}>
                      {item.itemQty}×
                    </Text>
                    <Text className="flex-1 text-[15px] leading-5 text-foreground">
                      {item.itemName}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </CardBody>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
