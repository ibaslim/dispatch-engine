import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@theme';
import { Card, CardBody, Badge, Ref } from '@components/ui';
import { DANGER, DANGER_BORDER } from '@constants/colors';
import type { DriverOrder } from '@types';
import { activityLabel } from '@utils/orderProgress';
import { RouteLine } from './RouteLine';

interface Props {
  order: DriverOrder;
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

/**
 * One job in the Orders list: identity and status, the two stops, then the
 * three things a driver does from the list — open it, call someone, or flag a
 * problem. Report is the only tinted control, so it can't be hit by accident.
 */
export function OrderCard({ order, onPress, onContact, onReport }: Props) {
  const { palette } = useTheme();

  return (
    <Card>
      <CardBody className="gap-4">
        <View className="flex-row items-start justify-between gap-3">
          <Ref>{order.order_number ?? '—'}</Ref>
          <Badge label={activityLabel(order.activity_status)} dot={false} />
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
            icon="call-outline"
            label="Contact"
            color={palette.foreground}
            onPress={onContact}
          />
          <IconAction
            icon="warning-outline"
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