import React from 'react';
import { View, Text, type ViewProps, type TextProps } from 'react-native';

/**
 * Card surface + slots, styled by the `.card*` classes (theme tokens). Compose:
 *
 *   <Card>
 *     <CardHeader><CardTitle>Order</CardTitle><Badge label="in transit" /></CardHeader>
 *     <CardBody>...</CardBody>
 *   </Card>
 */
export function Card({ className, style, ...rest }: ViewProps) {
  return (
    <View
      className={`card ${className ?? ''}`}
      // Subtle depth for light mode; invisible on dark (border carries it there).
      style={[{ boxShadow: '0px 2px 10px rgba(15, 23, 42, 0.06)' }, style]}
      {...rest}
    />
  );
}

export function CardHeader({ className, ...rest }: ViewProps) {
  return <View className={`card-header ${className ?? ''}`} {...rest} />;
}

export function CardBody({ className, ...rest }: ViewProps) {
  return <View className={`card-body ${className ?? ''}`} {...rest} />;
}

export function CardFooter({ className, ...rest }: ViewProps) {
  return <View className={`card-footer ${className ?? ''}`} {...rest} />;
}

export function CardTitle({ className, ...rest }: TextProps) {
  return <Text className={`card-title ${className ?? ''}`} {...rest} />;
}

export function CardSubtitle({ className, ...rest }: TextProps) {
  return <Text className={`card-subtitle ${className ?? ''}`} {...rest} />;
}
