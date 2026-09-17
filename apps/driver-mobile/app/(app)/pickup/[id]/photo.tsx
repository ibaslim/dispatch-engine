import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { PhotoCaptureScreen } from '@screens/PhotoCaptureScreen';
import { useOrders } from '@contexts';
import { verifyPickupByPhoto } from '@services/orders';

export default function PickupPhotoRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { getOrder, patchOrder } = useOrders();
  const order = getOrder(id);

  function onUploaded({ uri, note }: { uri: string; note: string }) {
    if (order) {
      patchOrder(order.id, {
        pickup_verification: {
          method: 'photo',
          photo_path: uri,
          note: note || null,
          verified_at: new Date().toISOString(),
          verified_by: order.driver?.id ?? null,
        },
      });
    }
    router.back();
  }

  return (
    <PhotoCaptureScreen
      orderId={id}
      orderNumber={order?.order_number ?? null}
      title="Parcel photo"
      hint="Photograph the whole parcel, address side up."
      notePlaceholder="Add a note for dispatch (optional)"
      upload={verifyPickupByPhoto}
      onCancel={() => router.back()}
      onUploaded={onUploaded}
    />
  );
}
