import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, useToast } from '@components/ui';
import { PublishedOrderCard } from '@components/orders';
import { DANGER } from '@constants/colors';
import { openLocationSettings } from '@services/driver';
import { goOnlineBlockedMessage, needsSettingsTrip, offlineReasonCopy } from '@utils/shift';
import { useOnlineStatus, usePublishedOrders, useRealtime } from '@contexts';
import { useAcceptOffer } from '@hooks';
import { useTheme } from '@theme';
import DRIVER_OFFLINE from '../../assets/images/driver-offline.png';
import DRIVER_ONLINE from '../../assets/images/driver-online.png';

/** Each artwork's own ratio, so neither rider is stretched at any width. */
const OFFLINE_RATIO = 712 / 874;
const ONLINE_RATIO = 814 / 948;
/** Softened so the rider reads as a backdrop behind the copy, not an illustration above it. */
const ART_BLUR = 1;
const ART_OPACITY = 0.8;

interface Props {
  /** Open one offer in full. */
  onOrderPress: (orderId: string) => void;
}

/**
 * Live pool of broadcast orders the driver can claim.
 */
export function AvailableScreen({ onOrderPress }: Props) {
  const { palette } = useTheme();
  const { width } = useWindowDimensions();
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
  const artWidth = Math.min(width * 0.35, 156);

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
        <View className="flex-1 p-5">
          <View className="flex-1 items-center justify-center gap-4">
            <Image
              source={DRIVER_OFFLINE}
              style={{
                width: artWidth,
                height: artWidth / OFFLINE_RATIO,
                opacity: ART_OPACITY,
              }}
              blurRadius={ART_BLUR}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
            <View className="flex-row items-center gap-2">
              <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: DANGER }} />
              <Text className="text-lg font-bold" style={{ color: DANGER }}>
                You&apos;re Offline
              </Text>
            </View>
            <Text className="text-center text-sm leading-5 text-muted">
              {offlineReasonCopy(offlineReason)}
            </Text>
          </View>
          {/* Pinned to the foot of the screen: the one action this state offers. */}
          <View className="gap-2">
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
              <Image
                source={DRIVER_ONLINE}
                style={{
                  width: artWidth,
                  height: artWidth / ONLINE_RATIO,
                  opacity: ART_OPACITY,
                }}
                blurRadius={ART_BLUR}
                resizeMode="contain"
                accessibilityIgnoresInvertColors
              />
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