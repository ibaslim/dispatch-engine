import React, { useState, useMemo } from 'react';
import { View, Text, FlatList, RefreshControl, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@theme';
import { useOrders } from '@contexts';
import { Card, CardBody, Ref } from '@components/ui';
import type { DriverOrder } from '@types';

interface Props {
  onOrderPress: (id: string) => void;
}

type Timeframe = 'all' | 'today' | 'week' | 'month';

function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr.slice(0, 10);
  }
}

/** Local calendar date as YYYY-MM-DD */
function getTodayStr(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** One figure from the selected timeframe. Three of these sit above the list. */
function StatTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <View className="flex-1 items-center rounded-2xl border border-border bg-card p-4">
      <Text className="text-xs font-bold uppercase tracking-wider text-muted">{label}</Text>
      <Text
        className={`mt-1.5 text-lg font-black ${accent ? 'text-primary' : 'text-foreground'}`}
      >
        {value}
      </Text>
    </View>
  );
}

export function ActivityScreen({ onOrderPress }: Props) {
  const { palette } = useTheme();
  const { orders, isLoading, isRefreshing, error, refresh } = useOrders();
  const [timeframe, setTimeframe] = useState<Timeframe>('all');

  // Filter for completed orders
  const completedOrders = useMemo(() => {
    return orders.filter(
      (o) => o.activity_status === 'delivered' || o.status === 'completed'
    );
  }, [orders]);

  // Filter completed orders by selected timeframe
  const filteredOrders = useMemo(() => {
    const today = getTodayStr();
    const nowMs = Date.now();
    const oneWeekAgoMs = nowMs - 7 * 24 * 60 * 60 * 1000;
    const oneMonthAgoMs = nowMs - 30 * 24 * 60 * 60 * 1000;

    return completedOrders.filter((o) => {
      if (!o.delivery_date) return timeframe === 'all';
      
      const orderDateStr = o.delivery_date.slice(0, 10);
      
      if (timeframe === 'today') {
        return orderDateStr === today;
      }
      
      if (timeframe === 'week') {
        const orderMs = new Date(o.delivery_date).getTime();
        return orderMs >= oneWeekAgoMs;
      }

      if (timeframe === 'month') {
        const orderMs = new Date(o.delivery_date).getTime();
        return orderMs >= oneMonthAgoMs;
      }

      return true;
    });
  }, [completedOrders, timeframe]);

  // Calculate dynamic stats
  const stats = useMemo(() => {
    const earnings = filteredOrders.reduce((sum, o) => sum + (o.driver_payout ?? 0), 0);
    const count = filteredOrders.length;
    const average = count > 0 ? earnings / count : 0;
    return { earnings, count, average };
  }, [filteredOrders]);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color={palette.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      {/* Header */}
      <View className="border-b border-border bg-background px-5 py-4">
        {/*<Text className="text-2xl font-bold text-foreground">Activity</Text>*/}

        {/* Timeframe Pills */}
        <View className=" flex-row gap-2">
          {(['all', 'today', 'week', 'month'] as const).map((t) => {
            const label = {
              all: 'All Time',
              today: 'Today',
              week: 'This Week',
              month: 'This Month',
            }[t];

            const active = timeframe === t;
            return (
              <TouchableOpacity
                key={t}
                onPress={() => setTimeframe(t)}
                activeOpacity={0.8}
                className={`rounded-full px-4 py-2 ${
                  active ? 'bg-primary' : 'bg-input'
                }`}
              >
                <Text
                  className={`text-xs font-bold ${
                    active ? 'text-primary-foreground' : 'text-muted'
                  }`}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Orders list — the stats ride in its header so they scroll away with
          the orders they describe; only the timeframe pills stay pinned. */}
      <FlatList
        data={filteredOrders}
        keyExtractor={(item) => item.id}
        // `grow` lets the empty state fill what's left under the stats and
        // centre itself; with rows present it costs nothing.
        contentContainerClassName="grow gap-4 p-5 pb-8"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refresh}
            tintColor={palette.primary}
            colors={[palette.primary]}
          />
        }
        ListHeaderComponent={
          <View className="gap-4">
            <View className="flex-row gap-3">
              <StatTile label="Earnings" value={formatUsd(stats.earnings)} accent />
              <StatTile label="Completed" value={String(stats.count)} />
              <StatTile label="Avg. Payout" value={formatUsd(stats.average)} />
            </View>
            <View className="gap-1">
              <Text className="text-[11px] font-bold uppercase tracking-[1px] text-muted">
                Delivered Orders
              </Text>
              {error && <Text className="text-[13px] text-muted">{error}</Text>}
            </View>
          </View>
        }
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center gap-2 px-5">
            <View className="rounded-full bg-input p-4">
              <Ionicons name="receipt-outline" size={32} color={palette.muted} />
            </View>
            <Text className="text-base font-semibold text-foreground mt-2">
              No completed orders
            </Text>
            <Text className="text-sm text-muted text-center px-6">
              Completed deliveries for the selected timeframe will appear here.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <ActivityOrderCard order={item} onPress={() => onOrderPress(item.id)} />
        )}
      />
    </SafeAreaView>
  );
}

function ActivityOrderCard({
  order,
  onPress,
}: {
  order: DriverOrder;
  onPress: () => void;
}) {
  return (
    <Card>
      <CardBody className="gap-3">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <Ionicons name="checkmark-circle" size={16} color="#10b981" />
            <Ref>{order.order_number ?? '—'}</Ref>
          </View>
          <Text className="text-[15px] font-extrabold text-primary">
            +{formatUsd(order.driver_payout ?? 0)}
          </Text>
        </View>

        <View className="h-px bg-border my-1" />

        <View className="gap-1.5">
          <View className="flex-row items-start gap-2">
            <Ionicons name="location-outline" size={16} color="#6b7280" className="mt-0.5" />
            <View className="flex-1">
              <Text className="text-xs text-muted">Delivered to</Text>
              <Text className="text-sm font-semibold text-foreground mt-0.5">
                {order.delivery_name}
              </Text>
              <Text className="text-xs text-muted mt-0.5">
                {order.delivery_address}
              </Text>
            </View>
          </View>
        </View>

        <View className="h-px bg-border my-1" />

        <View className="flex-row items-center justify-between">
          <Text className="text-xs text-muted">
            Completed on {formatDate(order.delivery_date)}
          </Text>
          <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.7}
            className="flex-row items-center gap-1"
          >
            <Text className="text-xs font-bold text-primary">Details</Text>
            <Ionicons name="chevron-forward" size={14} color="#3b82f6" />
          </TouchableOpacity>
        </View>
      </CardBody>
    </Card>
  );
}
