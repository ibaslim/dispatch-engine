import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AccessibilityInfo,
  Animated,
  Text,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type ToastVariant = 'error' | 'success' | 'info';

interface ToastOptions {
  variant?: ToastVariant;
  /** Auto-dismiss delay in ms (default 3200). */
  duration?: number;
}

interface ToastContextValue {
  show: (message: string, options?: ToastOptions) => void;
  hide: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

// Class names must be literal strings for NativeWind's static extraction.
// The whole popup is tinted per variant so an error doesn't read like a
// confirmation at a glance.
const SURFACE: Record<ToastVariant, string> = {
  error: 'border-red-500/30 bg-red-500/10',
  success: 'border-primary bg-primary-muted',
  info: 'border-border bg-card',
};

const LABEL: Record<ToastVariant, string> = {
  error: 'text-red-500',
  success: 'text-primary-muted-foreground',
  info: 'text-foreground',
};

/** Floating-card shadow, matching the project's Card elevation convention. */
const TOAST_SHADOW = '0px 6px 16px rgba(15, 23, 42, 0.16)';

interface ToastState {
  message: string;
  variant: ToastVariant;
}

/**
 * App-wide toast. Renders a single themed, auto-dismissing message anchored to
 * the bottom center. Trigger it from anywhere with `useToast().show(...)`.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastState | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(16)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 16, duration: 180, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) setToast(null);
    });
  }, [opacity, translateY]);

  const show = useCallback(
    (message: string, options?: ToastOptions) => {
      const variant = options?.variant ?? 'info';
      const duration = options?.duration ?? 3200;
      if (timer.current) clearTimeout(timer.current);
      setToast({ message, variant });
      opacity.setValue(0);
      translateY.setValue(16);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          damping: 15,
          stiffness: 180,
        }),
      ]).start();
      AccessibilityInfo.announceForAccessibility(message);
      timer.current = setTimeout(hide, duration);
    },
    [opacity, translateY, hide]
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const value = useMemo<ToastContextValue>(() => ({ show, hide }), [show, hide]);

  const variant = toast?.variant ?? 'info';

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <Animated.View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            bottom: insets.bottom + 80,
            left: 0,
            right: 0,
            alignItems: 'center',
            opacity,
            transform: [{ translateY }],
            zIndex: 9999,
          }}
        >
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={hide}
            accessibilityRole="alert"
            accessibilityLabel={toast.message}
            className={`mx-4 max-w-[440px] rounded-2xl border px-4 py-3 ${SURFACE[variant]}`}
            style={{ boxShadow: TOAST_SHADOW }}
          >
            <Text
              className={`text-center text-sm font-medium ${LABEL[variant]}`}
              numberOfLines={3}
            >
              {toast.message}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}
