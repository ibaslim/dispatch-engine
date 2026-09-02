import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@components/ui';
import { DANGER } from '@constants/colors';
import { uploadDeliveryPhoto } from '@services/orders';
import type { ProofOfDelivery } from '@types';

type Submission = NonNullable<ProofOfDelivery['submission']>;

interface Props {
  orderId: string;
  /** Order number, shown so the driver can confirm they're on the right job. */
  orderNumber: string | null;
  onCancel: () => void;
  /** The photo is on the server; merge it into the cached order. */
  onUploaded: (changes: Partial<Submission>) => void;
}


export function PhotoCaptureScreen({ orderId, orderNumber, onCancel, onUploaded }: Props) {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [shot, setShot] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  async function takeShot() {
    const camera = cameraRef.current;
    if (!camera || shot) return;
    setError(null);
    try {
      const picture = await camera.takePictureAsync({ quality: 0.9 });
      setShot(picture.uri);
    } catch {
      setError('The camera did not return a photo. Try again.');
    }
  }

  async function usePhoto() {
    if (!shot || uploading) return;
    setUploading(true);
    setError(null);
    try {
      await uploadDeliveryPhoto(orderId, { uri: shot, name: 'photo.jpg', type: 'image/jpeg' });
      onUploaded({ photo_path: shot, photo_uploaded_at: new Date().toISOString() });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not upload the photo.');
      setUploading(false);
    }
  }

  return (
    <View className="flex-1" style={{ backgroundColor: '#000000' }}>
      {shot ? (
        <Image
          source={{ uri: shot }}
          style={{ flex: 1 }}
          resizeMode="contain"
          accessibilityLabel="Photo you just took"
        />
      ) : permission?.granted ? (
        <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />
      ) : (
        <View className="flex-1 items-center justify-center gap-5 px-10">
          <Ionicons name="camera-outline" size={40} color="#ffffff" />
          <Text className="text-center text-[15px] text-white/70">
            Camera access is off. Turn it on to photograph the delivered parcel.
          </Text>
          <Button title="Turn on camera" variant="outline" onPress={requestPermission} />
        </View>
      )}

      {/* Chrome floats over the viewfinder so the image is never boxed in. */}
      <SafeAreaView edges={['top']} className="absolute left-0 right-0 top-0">
        <View className="flex-row items-center gap-3 px-5 py-3">
          <TouchableOpacity
            onPress={onCancel}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            className="h-9 w-9 items-center justify-center rounded-full"
            style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
          >
            <Ionicons name="close" size={20} color="#ffffff" />
          </TouchableOpacity>
          <View>
            <Text className="text-[15px] font-bold text-white">Delivery photo</Text>
            {orderNumber ? (
              <Text className="text-[12px] text-white/60">Order {orderNumber}</Text>
            ) : null}
          </View>
        </View>
      </SafeAreaView>

      <SafeAreaView edges={['bottom']} className="absolute bottom-0 left-0 right-0">
        <View className="gap-4 px-5 pb-4 pt-6">
          {error ? (
            <View
              className="flex-row items-center gap-2 rounded-xl px-4 py-3"
              style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
            >
              <Ionicons name="alert-circle" size={18} color={DANGER} />
              <Text className="flex-1 text-[13px]" style={{ color: DANGER }}>
                {error}
              </Text>
            </View>
          ) : null}

          {shot ? (
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={() => setShot(null)}
                disabled={uploading}
                accessibilityRole="button"
                className="h-[50px] flex-1 items-center justify-center rounded-xl border"
                style={{ borderColor: 'rgba(255,255,255,0.4)' }}
              >
                <Text className="text-[15px] font-bold text-white">Retake</Text>
              </TouchableOpacity>
              <Button
                title="Use photo"
                className="flex-1"
                loading={uploading}
                onPress={usePhoto}
              />
            </View>
          ) : (
            <View className="items-center gap-3">
              <Text className="text-[13px] text-white/70">
                Frame the parcel where you left it.
              </Text>
              <TouchableOpacity
                onPress={takeShot}
                disabled={!permission?.granted}
                accessibilityRole="button"
                accessibilityLabel="Take photo"
                className="h-[74px] w-[74px] items-center justify-center rounded-full"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.25)',
                  opacity: permission?.granted ? 1 : 0.4,
                }}
              >
                <View
                  className="h-[60px] w-[60px] rounded-full"
                  style={{ backgroundColor: '#ffffff' }}
                />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </SafeAreaView>

      {uploading ? (
        <View
          className="absolute inset-0 items-center justify-center gap-3"
          style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
        >
          <ActivityIndicator color="#ffffff" />
          <Text className="text-[14px] text-white">Uploading photo…</Text>
        </View>
      ) : null}
    </View>
  );
}