import React, { useState } from 'react';
import { View, Text, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@theme';
import { useOrders } from '@contexts';
import { useToast } from '@components/ui';
import { ContactSheet, OrderCard, ReportSheet } from '@components/orders';
import { reportIncident } from '@services/orders';
import type { DriverOrder, IncidentReason } from '@types';
import { incidentStageFor } from '@utils/orderProgress';

interface Props {
  onOrderPress: (id: string) => void;
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="text-[11px] font-bold uppercase tracking-[1px] text-muted">
      {children}
    </Text>
  );
}

/**
 * The driver's active jobs. Delivered orders drop off this list — they belong to
 * the completed history, not to work in progress.
 */
export function OrdersScreen({ onOrderPress }: Props) {
  const { palette } = useTheme();
  const { show } = useToast();
  const { inProgress, isLoading, isRefreshing, error, refresh, patchOrder } = useOrders();

  const [contactOrder, setContactOrder] = useState<DriverOrder | null>(null);
  const [reportOrder, setReportOrder] = useState<DriverOrder | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
      <View className="border-b border-border px-5 py-4">
        <Text className="text-2xl font-bold text-foreground">Orders</Text>
      </View>

      <FlatList
        data={inProgress}
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
          <View className="gap-1">
            <SectionLabel>In progress</SectionLabel>
            {error && <Text className="text-[13px] text-muted">{error}</Text>}
          </View>
        }
        ListEmptyComponent={
          <View className="items-center gap-1 py-24">
            <Text className="text-base font-semibold text-foreground">No active orders</Text>
            <Text className="text-sm text-muted">New jobs will appear here.</Text>
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