import React, { useState } from 'react';
import { View, Text, FlatList, RefreshControl, ActivityIndicator, TouchableOpacity } from 'react-native';
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
 * The driver's active jobs and disputed history.
 */
export function OrdersScreen({ onOrderPress }: Props) {
  const { palette } = useTheme();
  const { show } = useToast();
  const { orders, inProgress, isLoading, isRefreshing, error, refresh, patchOrder } = useOrders();

  const [activeTab, setActiveTab] = useState<'current' | 'disputed'>('current');
  const [contactOrder, setContactOrder] = useState<DriverOrder | null>(null);
  const [reportOrder, setReportOrder] = useState<DriverOrder | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Current: active orders that DO NOT have an incident report and are not completed
  const currentOrders = inProgress.filter((o) => !o.incident_report && o.status !== 'completed');
  
  // Disputed: active orders that DO have an incident report and are not completed
  const disputedOrders = inProgress.filter(
    (o) => o.incident_report !== null && o.incident_report !== undefined && o.status !== 'completed'
  );
  const disputedCount = disputedOrders.length;

  const activeData = activeTab === 'current' ? currentOrders : disputedOrders;

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
      <View className="border-b border-border bg-background px-5 py-4">
        <Text className="text-2xl font-bold text-foreground">Orders</Text>
        <View className="mt-3 flex-row rounded-xl bg-input p-1">
          <TouchableOpacity
            onPress={() => setActiveTab('current')}
            activeOpacity={0.8}
            className={`flex-1 flex-row items-center justify-center py-2 rounded-lg ${
              activeTab === 'current' ? 'bg-primary' : ''
            }`}
          >
            <Text
              className={`text-sm font-bold ${
                activeTab === 'current' ? 'text-primary-foreground' : 'text-muted'
              }`}
            >
              Current
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveTab('disputed')}
            activeOpacity={0.8}
            className={`flex-1 flex-row items-center justify-center py-2 rounded-lg gap-2 ${
              activeTab === 'disputed' ? 'bg-primary' : ''
            }`}
          >
            <Text
              className={`text-sm font-bold ${
                activeTab === 'disputed' ? 'text-primary-foreground' : 'text-muted'
              }`}
            >
              Disputed
            </Text>
            {disputedCount > 0 && (
              <View
                className={`rounded-full px-2 py-0.5 items-center justify-center ${
                  activeTab === 'disputed' ? 'bg-primary-foreground' : 'bg-primary'
                }`}
              >
                <Text
                  className={`text-[10px] font-bold ${
                    activeTab === 'disputed' ? 'text-primary' : 'text-primary-foreground'
                  }`}
                >
                  {disputedCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={activeData}
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
            <SectionLabel>{activeTab === 'current' ? 'In progress' : 'Disputed orders'}</SectionLabel>
            {error && <Text className="text-[13px] text-muted">{error}</Text>}
          </View>
        }
        ListEmptyComponent={
          <View className="items-center gap-1 py-24">
            <Text className="text-base font-semibold text-foreground">
              {activeTab === 'current' ? 'No active orders' : 'No disputed orders'}
            </Text>
            <Text className="text-sm text-muted text-center px-6">
              {activeTab === 'current'
                ? 'New jobs will appear here.'
                : 'Orders with a driver-reported issue will appear here.'}
            </Text>
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