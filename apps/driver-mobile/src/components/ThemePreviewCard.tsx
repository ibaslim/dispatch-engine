import React from 'react';
import { View } from 'react-native';
import { Card, CardBody, CardSubtitle, Badge, Button, Ref } from '@components/ui';

/** A live sample job card so theme/mode changes can be previewed in context. */
export function ThemePreviewCard() {
  return (
    <Card>
      <CardBody className="gap-3">
        <View className="flex-row items-center justify-between">
          <Ref>A-1029</Ref>
          <Badge label="in transit" />
        </View>
        <CardSubtitle>128 King St → 40 Harbour Esplanade</CardSubtitle>
        <View className="mt-1 flex-row gap-3">
          <Button title="Accept" className="flex-1" onPress={() => {}} />
          <Button title="Details" variant="outline" className="flex-1" onPress={() => {}} />
        </View>
      </CardBody>
    </Card>
  );
}
