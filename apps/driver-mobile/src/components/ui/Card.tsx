import React from 'react';
import { View, Text, type ViewProps, type TextProps } from 'react-native';

interface CardProps extends ViewProps {
  /** Adds the colored status edge (shipping-label motif). */
  accent?: boolean;
}

/**
 * Card surface + slots, styled by the `.card*` classes (theme tokens). Pass
 * `accent` for the status edge. Compose:
 *
 *   <Card accent>
 *     <CardHeader><CardTitle>Order</CardTitle><Badge label="in transit" /></CardHeader>
 *     <CardBody>...</CardBody>
 *   </Card>
 */
export function Card({ accent, className, style, ...rest }: CardProps) {
  return (
    <View
      className={`card ${accent ? 'card-accent' : ''} ${className ?? ''}`}
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
