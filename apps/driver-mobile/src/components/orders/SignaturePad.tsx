import React, { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type NativeTouchEvent,
  type ViewStyle,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';

export interface SignaturePadHandle {
  capture: () => Promise<string>;
  clear: () => void;
}

interface Props {
  /** Reports whether the pad currently holds at least one stroke. */
  onChange?: (hasInk: boolean) => void;
  /** Rendered behind the ink — the signature line, hints, etc. */
  children?: React.ReactNode;
  className?: string;
  style?: ViewStyle;
}

const INK = '#111111';
const STROKE_WIDTH = 3;

function clamp(value: number, max: number): number {
  if (value < 0) return 0;
  return value > max ? max : value;
}

export const SignaturePad = forwardRef<SignaturePadHandle, Props>(function SignaturePad(
  { onChange, children, className, style },
  ref,
) {
  const padRef = useRef<View>(null);
  const [paths, setPaths] = useState<string[]>([]);
  const [current, setCurrent] = useState('');
  const currentRef = useRef('');
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  /** Pad origin in page space, derived once per stroke — see `onPanResponderGrant`. */
  const origin = useRef({ x: 0, y: 0 });
  const size = useRef({ width: 0, height: 0 });
  /** Only the finger that started the stroke draws; later fingers are ignored. */
  const touchId = useRef<NativeTouchEvent['identifier'] | null>(null);

  const pointAt = (pageX: number, pageY: number) => {
    const x = clamp(pageX - origin.current.x, size.current.width);
    const y = clamp(pageY - origin.current.y, size.current.height);
    return `${x.toFixed(1)} ${y.toFixed(1)}`;
  };

  /** The tracked finger's touch in this event, or null if it isn't in it. */
  const trackedTouch = (event: GestureResponderEvent): NativeTouchEvent | null => {
    const id = touchId.current;
    if (id === null) return null;
    const { changedTouches } = event.nativeEvent;
    if (changedTouches?.length) {
      return changedTouches.find((touch) => touch.identifier === id) ?? null;
    }
    return event.nativeEvent.identifier === id ? event.nativeEvent : null;
  };

  const endStroke = () => {
    const stroke = currentRef.current;
    currentRef.current = '';
    touchId.current = null;
    setCurrent('');
    if (!stroke) return;
    // A tap is a legitimate mark (the dot on an "i"): give it a zero-length
    // segment so the round line cap renders it as a dot.
    const d = stroke.includes('L') ? stroke : `${stroke} L ${stroke.slice(2)}`;
    setPaths((existing) => [...existing, d]);
    onChangeRef.current?.(true);
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // A parent scroll container must not be able to snatch a stroke halfway.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (event) => {
        const touch = event.nativeEvent;
        touchId.current = touch.identifier;
        // `locationX/Y` is trustworthy on this one event only, because the
        // finger is provably inside the pad — so use it once to place the pad
        // in page space, then work in page space from here on.
        origin.current = {
          x: touch.pageX - touch.locationX,
          y: touch.pageY - touch.locationY,
        };
        currentRef.current = `M ${pointAt(touch.pageX, touch.pageY)}`;
        setCurrent(currentRef.current);
      },
      onPanResponderMove: (event) => {
        const touch = trackedTouch(event);
        if (!touch) return;
        currentRef.current += ` L ${pointAt(touch.pageX, touch.pageY)}`;
        setCurrent(currentRef.current);
      },
      onPanResponderRelease: endStroke,
      onPanResponderTerminate: endStroke,
    }),
  ).current;

  useImperativeHandle(ref, () => ({
    capture: () => captureRef(padRef, { format: 'png', quality: 1, result: 'tmpfile' }),
    clear: () => {
      currentRef.current = '';
      touchId.current = null;
      setCurrent('');
      setPaths([]);
      onChangeRef.current?.(false);
    },
  }));

  // Committed strokes only re-render when one is added, not on every move —
  // a long signature otherwise re-mounts every Path 60 times a second.
  const committed = useMemo(
    () =>
      paths.map((d, index) => (
        <Path
          key={index}
          d={d}
          stroke={INK}
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      )),
    [paths],
  );

  return (
    <View
      ref={padRef}
      collapsable={false}
      {...pan.panHandlers}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        size.current = { width, height };
      }}
      className={className}
      style={[{ backgroundColor: '#ffffff', overflow: 'hidden' }, style]}
      accessibilityLabel="Signature pad"
    >
      {/* Guides sit under the ink and take no layout space of their own. */}
      {children ? <View style={StyleSheet.absoluteFill}>{children}</View> : null}
      <Svg width="100%" height="100%">
        {committed}
        {current ? (
          <Path
            d={current}
            stroke={INK}
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        ) : null}
      </Svg>
    </View>
  );
});