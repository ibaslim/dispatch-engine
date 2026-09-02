import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  type TouchableOpacityProps,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@theme';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost';
export type ButtonSize = 'md' | 'sm';

interface ButtonProps extends TouchableOpacityProps {
  title: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Optional leading glyph. Takes the label's colour for the variant. */
  icon?: keyof typeof Ionicons.glyphMap;
}

const CONTAINER: Record<ButtonVariant, string> = {
  primary: 'btn btn-primary',
  secondary: 'btn btn-secondary',
  outline: 'btn btn-outline',
  ghost: 'btn btn-ghost',
};

const LABEL: Record<ButtonVariant, string> = {
  primary: 'btn-text btn-text-primary',
  secondary: 'btn-text btn-text-secondary',
  outline: 'btn-text btn-text-outline',
  ghost: 'btn-text btn-text-ghost',
};


export function Button({
  title,
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  disabled,
  className,
  ...rest
}: ButtonProps) {
  const { palette } = useTheme();
  const isDisabled = disabled || loading;

  const container = [
    CONTAINER[variant],
    size === 'sm' && 'btn-sm',
    isDisabled && 'opacity-60',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const label = [LABEL[variant], size === 'sm' && 'btn-text-sm']
    .filter(Boolean)
    .join(' ');

  // The label's colour comes from a class, so the icon — which needs a real
  // value — mirrors that mapping here. Keep the two in sync with `LABEL`.
  const glyphColor =
    variant === 'primary'
      ? palette['primary-foreground']
      : variant === 'secondary'
        ? palette['primary-muted-foreground']
        : variant === 'ghost'
          ? palette.primary
          : palette.foreground;

  return (
    <TouchableOpacity
      className={container}
      disabled={isDisabled}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: loading }}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={glyphColor} />
      ) : (
        <>
          {icon ? (
            <Ionicons name={icon} size={size === 'sm' ? 16 : 18} color={glyphColor} />
          ) : null}
          <Text className={label}>{title}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}
