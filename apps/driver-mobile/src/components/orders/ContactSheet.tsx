import React from 'react';
import { BottomSheet, BottomSheetItem } from '@components/ui';
import type { DriverOrder } from '@types';
import { callNumber } from '@utils/linking';

interface Props {
  /** The order to call about; null keeps the sheet closed. */
  order: DriverOrder | null;
  onClose: () => void;
}

/** Call the people on a job — sender, recipient, or dispatch. */
export function ContactSheet({ order, onClose }: Props) {
  const dial = (phone: string) => {
    onClose();
    callNumber(phone);
  };

  return (
    <BottomSheet visible={order !== null} onClose={onClose} title="Contact">
      {order && (
        <>
          <BottomSheetItem
            icon="call"
            title="Call Pickup Contact"
            subtitle={order.pickup_name}
            onPress={() => dial(order.pickup_phone)}
          />
          <BottomSheetItem
            icon="call"
            title="Call Recipient"
            subtitle={order.delivery_name}
            onPress={() => dial(order.delivery_phone)}
            last
          />
        </>
      )}
    </BottomSheet>
  );
}
