import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { PanResponder, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';

export interface SignaturePadHandle {
  /** Snapshot the pad to a PNG file and resolve with its `file://` uri. */
  capture: () => Promise<string>;
  clear: () => void;
}

interface Props {
  height?: number;
  /** Reports whether the pad currently holds at least one stroke. */
  onChange?: (hasInk: boolean) => void;
}

/**
 * Finger-drawn signature capture. Always white with black ink regardless of
 * theme — the PNG is emailed to the sender and shown to dispatchers, so it must
 * look like paper, not like the app (mirrors dispatcher-web's white canvas).
 */
export const SignaturePad = forwardRef<SignaturePadHandle, Props>(function SignaturePad(
  { height = 180, onChange },
  ref,
) {
  const padRef = useRef<View>(null);
  const [paths, setPaths] = useState<string[]>([]);
  const [current, setCurrent] = useState('');
  const currentRef = useRef('');
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const endStroke = () => {
    const stroke = currentRef.current;
    currentRef.current = '';
    setCurrent('');
    // A bare "M" is a tap, not a stroke — ignore it like the web canvas does.
    if (stroke.includes('L')) {
      setPaths((existing) => [...existing, stroke]);
      onChangeRef.current?.(true);
    }
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => {
        const { locationX, locationY } = event.nativeEvent;
        currentRef.current = `M ${locationX.toFixed(1)} ${locationY.toFixed(1)}`;
        setCurrent(currentRef.current);
      },
      onPanResponderMove: (event) => {
        const { locationX, locationY } = event.nativeEvent;
        currentRef.current += ` L ${locationX.toFixed(1)} ${locationY.toFixed(1)}`;
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
      setCurrent('');
      setPaths([]);
      onChangeRef.current?.(false);
    },
  }));

  return (
    <View
      ref={padRef}
      collapsable={false}
      {...pan.panHandlers}
      className="w-full overflow-hidden rounded-xl border border-border"
      style={{ height, backgroundColor: '#ffffff' }}
      accessibilityLabel="Signature pad"
    >
      <Svg width="100%" height="100%">
        {[...paths, current].filter(Boolean).map((d, index) => (
          <Path
            key={index}
            d={d}
            stroke="#111111"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        ))}
      </Svg>
    </View>
  );
});