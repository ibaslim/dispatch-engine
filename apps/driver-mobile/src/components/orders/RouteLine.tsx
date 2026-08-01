import React from 'react';
import { View, Text } from 'react-native';

interface Props {
  pickup: string;
  drop: string;
}

/**
 * The two stops of a job, joined by a connector — a round node for the pickup,
 * a square one for the drop, echoing the map pins on the detail screen.
 *
 * The connector's 4.5px offset centres a 1px rule under the 10px node above it.
 * It's a literal style rather than a class because NativeWind can't express a
 * half-pixel margin through the spacing scale.
 */
export function RouteLine({ pickup, drop }: Props) {
  return (
    <View>
      <View className="flex-row items-center gap-3">
        <View className="h-2.5 w-2.5 rounded-full bg-primary" />
        <Text className="flex-1 text-[15px] text-foreground" numberOfLines={1}>
          {pickup}
        </Text>
      </View>

      <View className="h-5 w-px bg-border" style={{ marginLeft: 4.5 }} />

      <View className="flex-row items-center gap-3">
        <View className="h-2.5 w-2.5 rounded-[3px] bg-foreground" />
        <Text className="flex-1 text-[15px] text-muted" numberOfLines={1}>
          {drop}
        </Text>
      </View>
    </View>
  );
}