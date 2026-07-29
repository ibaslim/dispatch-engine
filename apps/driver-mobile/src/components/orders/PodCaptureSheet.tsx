import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@theme';
import { Button } from '@components/ui';
import { DANGER, DANGER_SOFT, SUCCESS, SUCCESS_SOFT } from '@constants/colors';
import { uploadDeliveryPhoto, uploadDeliverySignature } from '@services/orders';
import type { ProofOfDelivery } from '@types';
import { SignaturePad, type SignaturePadHandle } from './SignaturePad';

type Submission = NonNullable<ProofOfDelivery['submission']>;

interface Props {
  visible: boolean;
  orderId: string;
  /**
   * Whether this order was created with the signature requirement. The photo is
   * always required — same rule as dispatcher-web's POD modal, which demands a
   * photo regardless of the order's `picture` flag.
   */
  signatureRequired: boolean;
  /** What the driver has already uploaded — reopening never re-demands it. */
  submission: ProofOfDelivery['submission'] | undefined;
  /** The parent's "mark delivered" PATCH is in flight. */
  completing: boolean;
  onClose: () => void;
  /** An upload succeeded; the parent should merge this into its order cache. */
  onProofUpdate: (changes: Partial<Submission>) => void;
  /** All required proof is uploaded and the driver confirmed delivery. */
  onDelivered: () => void;
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="mb-2 text-[11px] font-bold uppercase tracking-[1px] text-muted">
      {children}
    </Text>
  );
}

function UploadedBanner({ text }: { text: string }) {
  return (
    <View
      className="flex-row items-center gap-2 rounded-xl px-4 py-3"
      style={{ backgroundColor: SUCCESS_SOFT }}
    >
      <Ionicons name="checkmark-circle" size={20} color={SUCCESS} />
      <Text className="flex-1 text-[14px] font-bold" style={{ color: SUCCESS }}>
        {text}
      </Text>
    </View>
  );
}

/**
 * Proof-of-delivery capture at the door. Mirrors dispatcher-web's POD modal:
 * the photo (always) and signature (when the order requires one) are uploaded
 * immediately as they're captured — each upload stands on its own server-side —
 * and "Mark Delivered" only unlocks once everything required is stored.
 *
 * Errors render inline rather than via `useToast`: the root-mounted toast draws
 * *under* a native Modal, so anything shown while this sheet is open would be
 * invisible.
 */
export function PodCaptureSheet({
  visible,
  orderId,
  signatureRequired,
  submission,
  completing,
  onClose,
  onProofUpdate,
  onDelivered,
}: Props) {
  const { palette } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const signatureRef = useRef<SignaturePadHandle>(null);

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoDone, setPhotoDone] = useState(false);

  const [hasInk, setHasInk] = useState(false);
  const [recipientName, setRecipientName] = useState('');
  const [signatureUploading, setSignatureUploading] = useState(false);
  const [signatureDone, setSignatureDone] = useState(false);

  const [error, setError] = useState<string | null>(null);

  // Seed from what's already on the server each time the sheet opens, so a
  // reopened sheet (or an app restart mid-flow) never demands proof twice.
  useEffect(() => {
    if (!visible) return;
    setPhotoUri(null);
    setPhotoUploading(false);
    setPhotoDone(Boolean(submission?.photo_path));
    setHasInk(false);
    setRecipientName(submission?.recipient_name ?? '');
    setSignatureUploading(false);
    setSignatureDone(Boolean(submission?.signature_path));
    setError(null);
    // `submission` is intentionally omitted: it's a snapshot taken on open only.
  }, [visible]);

  useEffect(() => {
    if (visible && permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [visible, permission, requestPermission]);

  async function capturePhoto() {
    const camera = cameraRef.current;
    if (!camera || photoUploading) return;
    setPhotoUploading(true);
    setError(null);
    try {
      const shot = await camera.takePictureAsync({ quality: 0.9 });
      await uploadDeliveryPhoto(orderId, {
        uri: shot.uri,
        name: 'photo.jpg',
        type: 'image/jpeg',
      });
      setPhotoUri(shot.uri);
      setPhotoDone(true);
      onProofUpdate({
        photo_path: shot.uri,
        photo_uploaded_at: new Date().toISOString(),
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not upload the photo.');
    } finally {
      setPhotoUploading(false);
    }
  }

  async function saveSignature() {
    const pad = signatureRef.current;
    if (!pad || signatureUploading) return;
    setSignatureUploading(true);
    setError(null);
    try {
      const uri = await pad.capture();
      const name = recipientName.trim();
      await uploadDeliverySignature(orderId, { uri, name: 'signature.png', type: 'image/png' }, name);
      setSignatureDone(true);
      onProofUpdate({
        signature_path: uri,
        recipient_name: name,
        signature_uploaded_at: new Date().toISOString(),
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not upload the signature.');
    } finally {
      setSignatureUploading(false);
    }
  }

  function redoSignature() {
    signatureRef.current?.clear();
    setHasInk(false);
    setSignatureDone(false);
  }

  const canSaveSignature = hasInk && recipientName.trim().length > 0;
  const canMarkDelivered = photoDone && (!signatureRequired || signatureDone);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <SafeAreaView className="flex-1 bg-background">
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View className="flex-row items-center gap-3 px-5 py-3">
            <TouchableOpacity
              onPress={onClose}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Close proof of delivery"
              className="h-9 w-9 items-center justify-center rounded-full border border-border bg-card"
            >
              <Ionicons name="close" size={20} color={palette.foreground} />
            </TouchableOpacity>
            <Text className="text-xl font-bold text-foreground">Proof of delivery</Text>
          </View>

          <ScrollView
            contentContainerClassName="gap-6 px-5 pb-8"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View>
              <SectionLabel>Delivery photo</SectionLabel>
              {photoDone ? (
                <View className="gap-3">
                  {photoUri ? (
                    <Image
                      source={{ uri: photoUri }}
                      className="h-64 w-full rounded-xl"
                      resizeMode="cover"
                      accessibilityLabel="Captured delivery photo"
                    />
                  ) : null}
                  <UploadedBanner text="Photo uploaded." />
                  <Button
                    title="Retake photo"
                    variant="outline"
                    onPress={() => {
                      setPhotoDone(false);
                      setPhotoUri(null);
                    }}
                  />
                </View>
              ) : (
                <View className="gap-3">
                  <View className="h-64 overflow-hidden rounded-xl bg-black">
                    {permission?.granted ? (
                      <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />
                    ) : (
                      <View className="flex-1 items-center justify-center gap-4 px-8">
                        <Ionicons name="camera-outline" size={36} color="#ffffff" />
                        <Text className="text-center text-sm text-white/80">
                          Camera access is needed to photograph the delivered parcel.
                        </Text>
                        <Button title="Allow camera" variant="outline" onPress={requestPermission} />
                      </View>
                    )}
                    {photoUploading && (
                      <View className="absolute inset-0 items-center justify-center bg-black/50">
                        <ActivityIndicator color="#ffffff" />
                        <Text className="mt-2 text-sm text-white">Uploading…</Text>
                      </View>
                    )}
                  </View>
                  <Button
                    title="Capture photo"
                    loading={photoUploading}
                    disabled={!permission?.granted}
                    onPress={capturePhoto}
                  />
                </View>
              )}
            </View>

            {signatureRequired && (
              <View>
                <SectionLabel>Recipient signature</SectionLabel>
                {signatureDone ? (
                  <View className="gap-3">
                    <UploadedBanner
                      text={
                        recipientName.trim()
                          ? `Signature saved for ${recipientName.trim()}.`
                          : 'Signature saved.'
                      }
                    />
                    <Button title="Redo signature" variant="outline" onPress={redoSignature} />
                  </View>
                ) : (
                  <View className="gap-3">
                    <SignaturePad ref={signatureRef} onChange={setHasInk} />
                    <View className="flex-row items-center justify-between">
                      <Text className="text-[13px] text-muted">Sign inside the box.</Text>
                      {hasInk && (
                        <Text
                          className="text-[13px] font-semibold text-primary"
                          accessibilityRole="button"
                          onPress={redoSignature}
                        >
                          Clear
                        </Text>
                      )}
                    </View>
                    <TextInput
                      value={recipientName}
                      onChangeText={setRecipientName}
                      placeholder="Recipient's name"
                      placeholderTextColor={palette.muted}
                      autoCapitalize="words"
                      className="h-[50px] rounded-xl bg-input px-4 text-[15px] text-foreground"
                    />
                    <Button
                      title="Save signature"
                      loading={signatureUploading}
                      disabled={!canSaveSignature}
                      onPress={saveSignature}
                    />
                  </View>
                )}
              </View>
            )}

            {error && (
              <View
                className="flex-row items-center gap-2 rounded-xl px-4 py-3"
                style={{ backgroundColor: DANGER_SOFT }}
              >
                <Ionicons name="alert-circle" size={20} color={DANGER} />
                <Text className="flex-1 text-[14px]" style={{ color: DANGER }}>
                  {error}
                </Text>
              </View>
            )}

            <Button
              title="Mark Delivered"
              loading={completing}
              disabled={!canMarkDelivered}
              onPress={onDelivered}
            />
            {!canMarkDelivered && (
              <Text className="-mt-3 text-center text-[13px] text-muted">
                {photoDone
                  ? 'Capture the recipient’s signature to finish.'
                  : signatureRequired
                    ? 'A photo and signature are required before completing.'
                    : 'A delivery photo is required before completing.'}
              </Text>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}