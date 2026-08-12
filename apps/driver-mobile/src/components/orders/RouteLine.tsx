import React from 'react';
import { View, Text } from 'react-native';

interface Props {
  pickup: string;
  drop: string;
}

/** Centres a 10px node on the first 20px line of text beside it. */
const NODE_OFFSET = { marginTop: 5 };

export function RouteLine({ pickup, drop }: Props) {
  return (
    <View>
      <View className="flex-row gap-3">
        <View className="items-center">
          <View className="h-2.5 w-2.5 rounded-full bg-primary" style={NODE_OFFSET} />
          <View className="mt-1 w-px flex-1 bg-border" />
        </View>
        <Text className="flex-1 pb-3 text-sm leading-5 text-foreground">{pickup}</Text>
      </View>

      <View className="flex-row gap-3">
        <View className="items-center">
          <View className="h-2.5 w-2.5 rounded-[3px] bg-foreground" style={NODE_OFFSET} />
        </View>
        <Text className="flex-1 text-sm leading-5 text-muted">{drop}</Text>
      </View>
    </View>
  );
}