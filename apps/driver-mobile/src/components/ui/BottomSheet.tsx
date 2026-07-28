import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@theme';

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

const BACKDROP_OPACITY = 0.5;
/** Drag distance / velocity past which a release dismisses the sheet. */
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 0.9;

/**
 * Bottom sheet modal: a card that slides up from the bottom edge (covering the
 * navigation bar), with rounded top corners, a drag handle, a tap-to-dismiss
 * backdrop, and drag-to-dismiss. Its height is driven by the content.
 */
export function BottomSheet({ visible, onClose, children }: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const translateY = useRef(new Animated.Value(height)).current;
  const backdrop = useRef(new Animated.Value(0)).current;

  const animateOut = useCallback(
    (afterClose?: () => void) => {
      Animated.parallel([
        Animated.timing(backdrop, { toValue: 0, duration: 180, useNativeDriver: false }),
        Animated.timing(translateY, { toValue: height, duration: 200, useNativeDriver: false }),
      ]).start(({ finished }) => {
        if (finished) {
          setMounted(false);
          afterClose?.();
        }
      });
    },
    [backdrop, translateY, height]
  );

  // Mount on open; play the exit animation before unmounting on close.
  useEffect(() => {
    if (visible) {
      setMounted(true);
    } else if (mounted) {
      animateOut();
    }
  }, [visible, mounted, animateOut]);

  // Slide in once mounted.
  useEffect(() => {
    if (mounted && visible) {
      translateY.setValue(height);
      backdrop.setValue(0);
      Animated.parallel([
        Animated.timing(backdrop, {
          toValue: BACKDROP_OPACITY,
          duration: 220,
          useNativeDriver: false,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: false,
          damping: 22,
          stiffness: 220,
        }),
      ]).start();
    }
  }, [mounted, visible, translateY, backdrop, height]);

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > DISMISS_DISTANCE || g.vy > DISMISS_VELOCITY) {
          onClose();
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: false,
            damping: 22,
            stiffness: 220,
          }).start();
        }
      },
    })
  ).current;

  if (!mounted) return null;

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View className="flex-1 justify-end">
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel="Close"
        >
          <Animated.View
            style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: backdrop }]}
          />
        </Pressable>

        <Animated.View
          style={{ transform: [{ translateY }] }}
          className="rounded-t-3xl bg-card"
        >
          <View {...pan.panHandlers} className="items-center pb-1 pt-3">
            <View className="h-1.5 w-10 rounded-full bg-border" />
          </View>
          <View style={{ paddingBottom: insets.bottom + 8 }}>{children}</View>
        </Animated.View>
      </View>
    </Modal>
  );
}

/** Sheet heading (e.g. "Contact"). */
export function BottomSheetTitle({ children }: { children: string }) {
  return (
    <Text className="px-5 pb-2 pt-1 text-xl font-bold text-foreground">{children}</Text>
  );
}

type SheetItemTint = 'primary' | 'rose';

interface BottomSheetItemProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  tint?: SheetItemTint;
  /** Hide the divider under the last row. */
  last?: boolean;
}

/** A tappable row: tinted icon chip + title/subtitle, with a divider below. */
export function BottomSheetItem({
  icon,
  title,
  subtitle,
  onPress,
  tint = 'primary',
  last = false,
}: BottomSheetItemProps) {
  const { palette } = useTheme();
  const chipBg = tint === 'rose' ? 'rgba(244, 63, 94, 0.12)' : palette['primary-muted'];
  const iconColor = tint === 'rose' ? '#f43f5e' : palette['primary-muted-foreground'];

  return (
    <>
      <TouchableOpacity
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={title}
        className="flex-row items-center gap-4 px-5 py-4"
      >
        <View
          className="h-11 w-11 items-center justify-center rounded-full"
          style={{ backgroundColor: chipBg }}
        >
          <Ionicons name={icon} size={20} color={iconColor} />
        </View>
        <View className="flex-1">
          <Text className="text-base font-semibold text-foreground">{title}</Text>
          {subtitle ? (
            <Text className="mt-0.5 text-sm text-muted">{subtitle}</Text>
          ) : null}
        </View>
      </TouchableOpacity>
      {!last ? <View className="ml-20 mr-5 h-px bg-border" /> : null}
    </>
  );
}
