import React, { useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { Button, useToast } from '@components/ui';
import { PublishedOrderCard } from '@components/orders';
import { DANGER, dangerSurface } from '@constants/colors';
import { openLocationSettings } from '@services/driver';
import { goOnlineBlockedMessage, needsSettingsTrip, offlineReasonCopy } from '@utils/shift';
import { useOnlineStatus, usePublishedOrders, useRealtime } from '@contexts';
import { useAcceptOffer } from '@hooks';
import { useTheme } from '@theme';

interface Props {
  /** Open one offer in full. */
  onOrderPress: (orderId: string) => void;
}

/**
 * Live pool of broadcast orders the driver can claim.
 */
export function AvailableScreen({ onOrderPress }: Props) {
  const { palette, scheme } = useTheme();
  const { show } = useToast();
  const { online, offlineReason, isRestoring, goOnline } = useOnlineStatus();
  const { connectionState } = useRealtime();
  const { available, isLoading, isRefreshing, error, refresh } = usePublishedOrders();
  const { acceptOffer, acceptingId } = useAcceptOffer();

  const [goingOnline, setGoingOnline] = useState(false);

  async function handleGoOnline() {
    setGoingOnline(true);
    try {
      const result = await goOnline();
      if (result !== 'online') {
        show(goOnlineBlockedMessage(result), { variant: 'error' });
      }
    } finally {
      setGoingOnline(false);
    }
  }

  const isStale = online && connectionState !== 'connected' && connectionState !== 'disabled';

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <View className=" border-border px-5 py-1">
        <View className="flex-row items-center justify-between">
          {/*<Text className="text-2xl font-bold text-foreground">Available</Text>*/}
          {online && !isStale && available.length > 0 && (
            <View className="flex-row items-center gap-2">
              <View className="h-2 w-2 rounded-full bg-primary" />
              <Text className="text-[12px] font-semibold text-primary">
                {available.length} live
              </Text>



            </View>
          )}
        </View>
        {isStale && (
          <Text className="mt-1 text-[12px] text-muted">
            Reconnecting — this list may be out of date.
          </Text>
        )}
      </View>

      {isRestoring ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={palette.primary} />
        </View>
      ) : !online ? (
        <View className="flex-1 justify-center p-5">
          <View className="gap-3 rounded-2xl border p-5" style={dangerSurface(scheme)}>
            <View className="flex-row items-center gap-2">
              <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: DANGER }} />
              <Text className="flex-1 text-lg font-bold" style={{ color: DANGER }}>
                You&apos;re Offline
              </Text>
            </View>
            <Text className="text-sm leading-5 text-foreground/80">
              {offlineReasonCopy(offlineReason)}
            </Text>
            <Button title="Go Online" loading={goingOnline} onPress={handleGoOnline} />
            {needsSettingsTrip(offlineReason) && (
              <Button
                title="Open settings"
                variant="outline"
                size="sm"
                onPress={openLocationSettings}
              />
            )}
          </View>
        </View>
      ) : isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={palette.primary} />
        </View>
      ) : (
        <FlatList
          data={available}
          keyExtractor={(item) => item.id}
          // `grow` lets the empty state fill the viewport and centre itself;
          // with rows present it costs nothing.
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
            error ? <Text className="text-[13px] text-muted">{error}</Text> : null
          }
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center gap-4 px-8">
              <View className="rounded-full bg-primary-muted p-6">
                <Ionicons
                  name="megaphone-outline"
                  size={40}
                  color={palette['primary-muted-foreground']}
                />
              </View>
              <Text className="text-base font-semibold text-foreground">
                No available orders right now
              </Text>
              <Text className="text-center text-sm text-muted">
                New broadcasts appear here the moment dispatch publishes them.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <PublishedOrderCard
              order={item}
              accepting={acceptingId === item.id}
              onPress={() => onOrderPress(item.id)}
              onAccept={() => acceptOffer(item.id)}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}