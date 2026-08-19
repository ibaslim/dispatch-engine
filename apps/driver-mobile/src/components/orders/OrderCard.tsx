import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@theme';
import { Card, CardBody, Badge, Ref } from '@components/ui';
import { DANGER, DANGER_BORDER } from '@constants/colors';
import type { DriverOrder } from '@types';
import { activityLabel, isPickupLeg } from '@utils/orderProgress';
import { coordsOf, formatDistance, roadDistanceKm, type Coords } from '@utils/distance';
import { RouteLine } from './RouteLine';

interface Props {
  order: DriverOrder;
  /** The driver's last known position; null while offline, which hides the distance. */
  driverPosition?: Coords | null;
  onPress: () => void;
  onContact: () => void;
  onReport: () => void;
}

/** Square icon action sitting beside the Details button. */
function IconAction({
  icon,
  label,
  color,
  borderColor,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  borderColor?: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="h-12 w-12 items-center justify-center rounded-xl border border-border"
      style={borderColor ? { borderColor } : undefined}
    >
      <Ionicons name={icon} size={20} color={color} />
    </TouchableOpacity>
  );
}

/** How far the driver's next stop is. Prefixed with ≈ — the figure is an estimate. */
function DistanceBadge({ km }: { km: number }) {
  return (
    <View className="rounded-full bg-primary-muted px-2 py-1">
      <Text className="text-[11px] font-bold text-primary-muted-foreground">
        ≈ {formatDistance(km)}
      </Text>
    </View>
  );
}

/**
 * One job in the Orders list: identity and status, the two stops, then the
 * three things a driver does from the list — open it, call someone, or flag a
 * problem. Report is the only tinted control, so it can't be hit by accident.
 */
export function OrderCard({ order, driverPosition, onPress, onContact, onReport }: Props) {
  const { palette } = useTheme();

  const pickupLeg = isPickupLeg(order.activity_status);
  const distanceKm = useMemo(() => {
    const target = pickupLeg
      ? coordsOf(order.pickup_latitude, order.pickup_longitude)
      : coordsOf(order.delivery_latitude, order.delivery_longitude);
    return driverPosition && target ? roadDistanceKm(driverPosition, target) : null;
  }, [
    driverPosition,
    pickupLeg,
    order.pickup_latitude,
    order.pickup_longitude,
    order.delivery_latitude,
    order.delivery_longitude,
  ]);

  return (
    <Card>
      <CardBody className="gap-4">
        <View className="flex-row items-start justify-between gap-3">
          <Ref>{order.order_number ?? '—'}</Ref>
          <View className="flex-row items-center gap-2">
            <Badge label={activityLabel(order.activity_status)} dot={false} />
            {distanceKm != null && <DistanceBadge km={distanceKm} />}
          </View>
        </View>

        <RouteLine pickup={order.pickup_address} drop={order.delivery_address} />

        <View className="flex-row items-center gap-3">
          <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={`Details for order ${order.order_number ?? order.id}`}
            className="h-12 flex-1 items-center justify-center rounded-xl border border-primary"
          >
            <Text className="text-[15px] font-bold text-primary">Details</Text>
          </TouchableOpacity>

          <IconAction
            icon="call"
            label="Contact"
            color={palette.primary}
            onPress={onContact}
          />
          <IconAction
            icon="warning"
            label="Report an issue"
            color={DANGER}
            borderColor={DANGER_BORDER}
            onPress={onReport}
          />
        </View>
      </CardBody>
    </Card>
  );
}