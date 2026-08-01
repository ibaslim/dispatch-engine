import React, { useEffect, useRef, useState } from 'react';
import { Modal, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@theme';
import { Button } from '@components/ui';
import { DANGER, DANGER_SOFT, SUCCESS, SUCCESS_SOFT } from '@constants/colors';

interface Props {
  visible: boolean;
  /**
   * The order number the scanned code must equal. The shipping label's QR
   * encodes the plain order number and nothing else, so verification is a
   * string comparison — same as dispatcher-web's `qr-scan-modal`. When null
   * (older orders without a number) any code passes, matching the web.
   */
  orderNo: string | null;
  onClose: () => void;
  /** Fired once, ~1s after a successful match so the driver sees the confirmation. */
  onMatched: () => void;
}

/** How long the green "matched" state shows before the sheet hands back control. */
const MATCH_LINGER_MS = 1000;

/**
 * Full-screen parcel verification at pickup. The driver points the camera at
 * the shipping label's QR code; a mismatch keeps the camera running with an
 * inline warning (wrong parcel in hand — keep looking), a match locks the
 * scanner and advances the job.
 */
export function QrScanSheet({ visible, orderNo, onClose, onMatched }: Props) {
  const { palette } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [matched, setMatched] = useState(false);
  const [mismatch, setMismatch] = useState<string | null>(null);
  const matchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fresh scanner every opening; never leak a pending match callback.
  useEffect(() => {
    if (!visible) {
      setMatched(false);
      setMismatch(null);
      if (matchTimer.current) {
        clearTimeout(matchTimer.current);
        matchTimer.current = null;
      }
    }
  }, [visible]);

  useEffect(() => {
    if (visible && permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [visible, permission, requestPermission]);

  function onScanned({ data }: BarcodeScanningResult) {
    if (matched) return;
    const scanned = data.trim();
    if (orderNo && scanned !== orderNo) {
      setMismatch(scanned);
      return;
    }
    setMatched(true);
    setMismatch(null);
    matchTimer.current = setTimeout(onMatched, MATCH_LINGER_MS);
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <SafeAreaView className="flex-1 bg-background">
        <View className="flex-row items-center gap-3 px-5 py-3">
          <TouchableOpacity
            onPress={onClose}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Close scanner"
            className="h-9 w-9 items-center justify-center rounded-full border border-border bg-card"
          >
            <Ionicons name="close" size={20} color={palette.foreground} />
          </TouchableOpacity>
          <Text className="text-xl font-bold text-foreground">Verify parcel</Text>
        </View>

        <View className="flex-1 gap-4 px-5 pb-6">
          <Text className="text-sm text-muted">
            Scan the QR code on the shipping label
            {orderNo ? ` to confirm this is order ${orderNo}.` : '.'}
          </Text>

          <View className="flex-1 overflow-hidden rounded-2xl bg-black">
            {permission?.granted ? (
              <CameraView
                style={{ flex: 1 }}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={matched ? undefined : onScanned}
              />
            ) : (
              <View className="flex-1 items-center justify-center gap-4 px-8">
                <Ionicons name="camera-outline" size={40} color="#ffffff" />
                <Text className="text-center text-sm text-white/80">
                  Camera access is needed to scan the parcel&apos;s QR code.
                </Text>
                <Button title="Allow camera" variant="outline" onPress={requestPermission} />
              </View>
            )}

            {/* Scan frame overlay */}
            {permission?.granted && !matched && (
              <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
                <View
                  className="h-56 w-56 rounded-2xl border-2"
                  style={{ borderColor: mismatch ? DANGER : 'rgba(255,255,255,0.85)' }}
                />
              </View>
            )}
          </View>

          {matched ? (
            <View
              className="flex-row items-center gap-2 rounded-xl px-4 py-3"
              style={{ backgroundColor: SUCCESS_SOFT }}
            >
              <Ionicons name="checkmark-circle" size={20} color={SUCCESS} />
              <Text className="flex-1 text-[14px] font-bold" style={{ color: SUCCESS }}>
                QR code matched. Marking as picked up…
              </Text>
            </View>
          ) : mismatch ? (
            <View
              className="flex-row items-center gap-2 rounded-xl px-4 py-3"
              style={{ backgroundColor: DANGER_SOFT }}
            >
              <Ionicons name="alert-circle" size={20} color={DANGER} />
              <Text className="flex-1 text-[14px]" style={{ color: DANGER }}>
                That code doesn&apos;t match this order
                {orderNo ? ` (expected ${orderNo})` : ''}. Check you have the right parcel.
              </Text>
            </View>
          ) : (
            <Text className="text-center text-[13px] text-muted">
              Hold the label inside the frame — it scans automatically.
            </Text>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}