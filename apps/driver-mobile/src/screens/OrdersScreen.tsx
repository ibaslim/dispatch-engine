import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@theme';
import { useOrders } from '@contexts';
import { useToast } from '@components/ui';
import { ContactSheet, OrderCard, ReportSheet } from '@components/orders';
import { DANGER } from '@constants/colors';
import { reportIncident } from '@services/orders';
import type { ActivityStatus, DriverOrder, IncidentReason } from '@types';
import { PROGRESS_STEPS, incidentStageFor } from '@utils/orderProgress';

interface Props {
  onOrderPress: (id: string) => void;
}

/**
 * `all` and `disputed` bracket the run of activity statuses: one to see the
 * whole shift at a glance, one for jobs that have stopped progressing. Between
 * them the pills follow `PROGRESS_STEPS` in order, so the row reads as the
 * journey a parcel actually takes.
 *
 * `delivered` is absent on purpose — a finished job belongs to Activity, and
 * repeating it here would give the driver two places to look for the same
 * order with two different answers about what to do next.
 */
type OrderFilter = 'all' | ActivityStatus | 'disputed';

const STATUS_FILTERS = PROGRESS_STEPS.filter((step) => step.status !== 'delivered');

interface FilterTab {
  key: OrderFilter;
  label: string;
  /** Shown when this filter is selected and finds nothing. */
  emptyTitle: string;
  emptyBody: string;
}

const TABS: FilterTab[] = [
  {
    key: 'all',
    label: 'All',
    emptyTitle: 'No active orders',
    emptyBody: 'Accepted jobs appear here until they are delivered.',
  },
  ...STATUS_FILTERS.map((step) => ({
    key: step.status as OrderFilter,
    label: step.shortLabel,
    emptyTitle: `Nothing at “${step.shortLabel}”`,
    emptyBody: `Jobs move here once you mark them ${step.label.toLowerCase()}.`,
  })),
  {
    key: 'disputed',
    label: 'Disputed',
    emptyTitle: 'No disputed orders',
    emptyBody: 'Jobs where you reported an issue appear here.',
  },
];

/**
 * A filter pill, matching the Activity screen's timeframe row.
 *
 * The count is set as plain numerals rather than a second chip inside the
 * pill: with seven pills on screen, a chip on each turns a filter row into a
 * wall of badges. Disputed is the exception — it carries the danger tint,
 * because a count there is the one number that means "something needs you".
 */
function FilterPill({
  label,
  count,
  active,
  danger,
  onPress,
}: {
  label: string;
  count: number;
  active: boolean;
  danger?: boolean;
  onPress: () => void;
}) {
  const countColor = active ? 'text-primary-foreground/70' : 'text-muted';

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={count > 0 ? `${label}, ${count} orders` : label}
      className={`flex-row items-center gap-1.5 rounded-full px-4 py-2 ${
        active ? 'bg-primary' : 'bg-input'
      }`}
    >
      <Text
        className={`text-xs font-bold ${active ? 'text-primary-foreground' : 'text-muted'}`}
      >
        {label}
      </Text>
      {count > 0 && (
        <Text
          className={`text-xs font-bold ${danger && !active ? '' : countColor}`}
          style={danger && !active ? { color: DANGER } : undefined}
        >
          {count}
        </Text>
      )}
    </TouchableOpacity>
  );
}

/**
 * The driver's active jobs, filtered by where each one has reached.
 */
export function OrdersScreen({ onOrderPress }: Props) {
  const { palette } = useTheme();
  const { show } = useToast();
  const { orders, isLoading, isRefreshing, error, refresh, patchOrder } = useOrders();

  const [filter, setFilter] = useState<OrderFilter>('all');
  const [contactOrder, setContactOrder] = useState<DriverOrder | null>(null);
  const [reportOrder, setReportOrder] = useState<DriverOrder | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Everything still on the driver's plate. Delivered and completed jobs have
  // left the Orders tab for Activity.
  const active = useMemo(
    () =>
      orders.filter(
        (order) => order.activity_status !== 'delivered' && order.status !== 'completed',
      ),
    [orders],
  );

  // A disputed job lives under Disputed only, so the status pills stay a clean
  // picture of work that is still moving.
  const disputed = useMemo(() => active.filter((order) => order.incident_report), [active]);
  const moving = useMemo(() => active.filter((order) => !order.incident_report), [active]);

  const counts = useMemo(() => {
    const byFilter: Record<string, number> = {
      all: moving.length,
      disputed: disputed.length,
    };
    for (const step of STATUS_FILTERS) {
      byFilter[step.status] = moving.filter(
        (order) => order.activity_status === step.status,
      ).length;
    }
    return byFilter;
  }, [moving, disputed]);

  const visible = useMemo(() => {
    if (filter === 'disputed') return disputed;
    if (filter === 'all') return moving;
    return moving.filter((order) => order.activity_status === filter);
  }, [filter, moving, disputed]);

  const activeTab = TABS.find((tab) => tab.key === filter) ?? TABS[0];

  async function submitReport(reason: IncidentReason, description: string | null) {
    if (!reportOrder) return;
    setSubmitting(true);
    try {
      const stage = incidentStageFor(reportOrder.activity_status);
      const { incident_report } = await reportIncident(
        reportOrder.id,
        stage,
        reason,
        description,
      );
      patchOrder(reportOrder.id, { incident_report });
      setReportOrder(null);
      show('Issue reported. Dispatch has been notified.', { variant: 'success' });
    } catch (err: unknown) {
      show(err instanceof Error ? err.message : 'Could not send the report.', {
        variant: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color={palette.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <View className="border-b border-border bg-background">
        <View className="flex-row items-center gap-2.5 px-5 pt-4">
          <Text className="text-2xl font-bold text-foreground">Orders</Text>
          {active.length > 0 && (
            <View className="rounded-full bg-primary-muted px-2.5 py-0.5">
              <Text className="text-[13px] font-bold text-primary-muted-foreground">
                {active.length}
              </Text>
            </View>
          )}
        </View>

        {/* Full-bleed so pills scroll past the screen edge rather than stopping
            inside a padded box — the cue that there is more row to reach. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2 px-5 pb-4 pt-4"
        >
          {TABS.map((tab) => (
            <FilterPill
              key={tab.key}
              label={tab.label}
              count={counts[tab.key] ?? 0}
              active={filter === tab.key}
              danger={tab.key === 'disputed'}
              onPress={() => setFilter(tab.key)}
            />
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        contentContainerClassName="gap-4 p-5 pb-8"
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
          error ? <Text className="text-[13px] text-muted">{error}</Text> : null
        }
        ListEmptyComponent={
          <View className="items-center gap-1 py-24">
            <Text className="text-base font-semibold text-foreground">
              {activeTab.emptyTitle}
            </Text>
            <Text className="px-6 text-center text-sm text-muted">{activeTab.emptyBody}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <OrderCard
            order={item}
            onPress={() => onOrderPress(item.id)}
            onContact={() => setContactOrder(item)}
            onReport={() => setReportOrder(item)}
          />
        )}
      />

      <ContactSheet order={contactOrder} onClose={() => setContactOrder(null)} />

      <ReportSheet
        visible={reportOrder !== null}
        stage={incidentStageFor(reportOrder?.activity_status ?? 'pickup_initiated')}
        submitting={submitting}
        onClose={() => setReportOrder(null)}
        onSubmit={submitReport}
      />
    </SafeAreaView>
  );
}