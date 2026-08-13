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
  Animated,
  Keyboard,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@theme';
// Deliberately the file, not the `@hooks` barrel: the barrel pulls in
// useAcceptOffer, which imports this folder's barrel back — a require cycle.
import { useKeyboardHeight } from '@hooks/useKeyboardHeight';

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

const BACKDROP_OPACITY = 0.5;
/** Drag distance / velocity past which a release dismisses the sheet. */
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 0.9;
/** Gap kept between the top of a tall sheet and the status bar. */
const TOP_GAP = 24;

interface SheetScroll {
  /** Bring the bottom of the sheet (usually a focused input) into view. */
  scrollToEnd: () => void;
}

const SheetScrollContext = createContext<SheetScroll>({ scrollToEnd: () => {} });

/**
 * Lets sheet content ask the sheet to scroll — e.g. a `TextInput`'s `onFocus`,
 * so a field near the bottom stays visible once the keyboard has taken its half
 * of the screen.
 */
export function useBottomSheetScroll() {
  return useContext(SheetScrollContext);
}

/**
 * Bottom sheet modal: a card that slides up from the bottom edge (covering the
 * navigation bar), with rounded top corners, a drag handle, a tap-to-dismiss
 * backdrop, and drag-to-dismiss. Its height is driven by the content.
 */
export function BottomSheet({ visible, onClose, children }: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  // Neither the OS nor KeyboardAvoidingView moves this Modal, so the sheet is
  // lifted by hand — see `useKeyboardHeight`.
  const keyboardHeight = useKeyboardHeight();
  const translateY = useRef(new Animated.Value(height)).current;
  const backdrop = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);
  // The PanResponder below is built once, so it would otherwise capture the
  // first render's `onClose`.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const scrollApi = useMemo<SheetScroll>(
    () => ({
      // Deferred: the keyboard metrics (and so the sheet's height) only land a
      // frame or two after focus.
      scrollToEnd: () => {
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
      },
    }),
    []
  );

  const animateOut = useCallback(
    (afterClose?: () => void) => {
      Keyboard.dismiss();
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

  const springBack = useCallback(() => {
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: false,
      damping: 22,
      stiffness: 220,
    }).start();
  }, [translateY]);

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      // Once the drag is ours, keep it: letting the ScrollView take over
      // mid-gesture strands the sheet at whatever offset it had reached.
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (_, g) => {
        if (g.dy > DISMISS_DISTANCE || g.vy > DISMISS_VELOCITY) {
          onCloseRef.current();
        } else {
          springBack();
        }
      },
      onPanResponderTerminate: springBack,
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
          style={{
            transform: [{ translateY }],
            marginBottom: keyboardHeight,
            maxHeight: height - insets.top - TOP_GAP - keyboardHeight,
          }}
          className="rounded-t-3xl bg-card"
        >
          {/*
            `collapsable={false}` is load-bearing, not a style choice. This view
            carries only layout props, so Fabric's view flattening
            (`newArchEnabled=true`) drops it from the native tree — the touch
            then hit-tests against the parent, which holds no responder, and the
            PanResponder never sees a finger. Drag-to-dismiss silently dies while
            the backdrop's tap-to-dismiss keeps working, because that Pressable
            has an `accessibilityLabel` and so survives flattening. Same reason
            SignaturePad sets it.
          */}
          <View
            {...pan.panHandlers}
            collapsable={false}
            className="items-center pb-3 pt-3"
          >
            <View className="h-1.5 w-10 rounded-full bg-border" />
          </View>
          <ScrollView
            ref={scrollRef}
            bounces={false}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              // The nav-bar inset is behind the keyboard while it's up.
              paddingBottom: (keyboardHeight > 0 ? 0 : insets.bottom) + 8,
            }}
          >
            <SheetScrollContext.Provider value={scrollApi}>
              {children}
            </SheetScrollContext.Provider>
          </ScrollView>
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
  /** Rendered at the trailing edge — a status pill, a chevron, a check. */
  trailing?: React.ReactNode;
}

/** A tappable row: tinted icon chip + title/subtitle, with a divider below. */
export function BottomSheetItem({
  icon,
  title,
  subtitle,
  onPress,
  tint = 'primary',
  last = false,
  trailing,
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
        {trailing}
      </TouchableOpacity>
      {!last ? <View className="ml-20 mr-5 h-px bg-border" /> : null}
    </>
  );
}
