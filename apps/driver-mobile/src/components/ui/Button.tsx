import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  type TouchableOpacityProps,
} from 'react-native';
import { useTheme } from '@theme';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost';
export type ButtonSize = 'md' | 'sm';

interface ButtonProps extends TouchableOpacityProps {
  title: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

// Class names MUST be written as complete literal strings — NativeWind extracts
// classes by static scanning, so a computed name like `btn-${variant}` would
// never get compiled. Keep these maps literal.
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

/**
 * Themed, tactile button. Colors/shape come from the `.btn*` classes
 * (global.css) so it tracks the active theme + mode; TouchableOpacity gives the
 * press dim. The label lives on an inner <Text> because RN doesn't inherit text
 * styles from the container.
 */
export function Button({
  title,
  variant = 'primary',
  size = 'md',
  loading = false,
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

  const spinnerColor =
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
        <ActivityIndicator color={spinnerColor} />
      ) : (
        <Text className={label}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}
