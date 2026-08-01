import React from 'react';
import { View, Text, type ViewProps, type TextProps } from 'react-native';

interface BadgeProps extends ViewProps {
  label: string;
  /** Leading status dot. On by default. */
  dot?: boolean;
}

/**
 * Manifest-style status tag: a small uppercase label with a status dot. Uses the
 * `.badge` / `.badge-text` classes (theme tokens); label sits on an inner
 * <Text> since RN text styles don't inherit from the View.
 */
export function Badge({ label, dot = true, className, ...rest }: BadgeProps) {
  return (
    <View className={`badge ${className ?? ''}`} {...rest}>
      {dot && <View className="badge-dot" />}
      <Text className="badge-text">{label}</Text>
    </View>
  );
}

/** Order / tracking number set like a waybill (mono, wide tracking, uppercase). */
export function Ref({ className, ...rest }: TextProps) {
  return <Text className={`ref ${className ?? ''}`} {...rest} />;
}
