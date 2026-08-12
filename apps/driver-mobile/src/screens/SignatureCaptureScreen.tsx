import React, { useRef, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@components/ui';
import { SignaturePad, type SignaturePadHandle } from '@components/orders';
import { DANGER } from '@constants/colors';
import { useKeyboardHeight } from '@hooks';
import { uploadDeliverySignature } from '@services/orders';
import type { ProofOfDelivery } from '@types';

type Submission = NonNullable<ProofOfDelivery['submission']>;

/** Paper ink for the chrome that sits on the white sheet. */
const PAPER_INK = '#111111';
const PAPER_MUTED = '#6b7280';
const PAPER_RULE = '#d4d4d8';

interface Props {
  orderId: string;
  initialName: string;
  onCancel: () => void;
  onUploaded: (changes: Partial<Submission>) => void;
}

export function SignatureCaptureScreen({ orderId, initialName, onCancel, onUploaded }: Props) {
  const padRef = useRef<SignaturePadHandle>(null);
  const keyboardHeight = useKeyboardHeight();
  const [hasInk, setHasInk] = useState(false);
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = hasInk && name.trim().length > 0 && !saving;

  function clear() {
    padRef.current?.clear();
    setHasInk(false);
  }

  async function save() {
    const pad = padRef.current;
    if (!pad || !canSave) return;
    setSaving(true);
    setError(null);
    try {
      const uri = await pad.capture();
      const recipient = name.trim();
      await uploadDeliverySignature(
        orderId,
        { uri, name: 'signature.png', type: 'image/png' },
        recipient,
      );
      onUploaded({
        signature_path: uri,
        recipient_name: recipient,
        signature_uploaded_at: new Date().toISOString(),
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not upload the signature.');
      setSaving(false);
    }
  }

  return (
    <View className="flex-1" style={{ backgroundColor: '#ffffff' }}>
      <SignaturePad ref={padRef} onChange={setHasInk} style={{ flex: 1 }} />

      <SafeAreaView edges={['top']} className="absolute left-0 right-0 top-0">
        <View className="flex-row items-center justify-between px-5 py-3">
          <View className="flex-row items-center gap-3">
            <TouchableOpacity
              onPress={onCancel}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              className="h-9 w-9 items-center justify-center rounded-full border"
              style={{ borderColor: PAPER_RULE }}
            >
              <Ionicons name="close" size={20} color={PAPER_INK} />
            </TouchableOpacity>
            <Text className="text-[15px] font-bold" style={{ color: PAPER_INK }}>
              Recipient signature
            </Text>
          </View>
          {hasInk ? (
            <Text
              className="text-[14px] font-semibold"
              style={{ color: PAPER_MUTED }}
              accessibilityRole="button"
              onPress={clear}
            >
              Clear
            </Text>
          ) : null}
        </View>
      </SafeAreaView>

      {/* Floats over the paper rather than shrinking it, so the keyboard can
          never re-lay-out the pad out from under a half-drawn signature. */}
      <SafeAreaView
        edges={keyboardHeight > 0 ? [] : ['bottom']}
        className="absolute left-0 right-0"
        style={{ bottom: keyboardHeight, backgroundColor: '#ffffff' }}
      >
        <View className="gap-3 px-5 pb-3 pt-4" style={{ borderTopWidth: 1, borderTopColor: PAPER_RULE }}>
          {error ? (
            <View className="flex-row items-center gap-2">
              <Ionicons name="alert-circle" size={18} color={DANGER} />
              <Text className="flex-1 text-[13px]" style={{ color: DANGER }}>
                {error}
              </Text>
            </View>
          ) : null}

          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Who signed for it?"
            placeholderTextColor={PAPER_MUTED}
            autoCapitalize="words"
            className="h-[50px] rounded-xl border px-4 text-[15px]"
            style={{ borderColor: PAPER_RULE, color: PAPER_INK, backgroundColor: '#f8f8f9' }}
          />

          {/* The paper around it is fixed white by design, but the action is
              still the app's action — it tracks the driver's accent theme. */}
          <Button
            title="Save signature"
            loading={saving}
            disabled={!canSave}
            onPress={save}
          />
        </View>
      </SafeAreaView>
    </View>
  );
}