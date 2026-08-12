import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@theme';
import { BottomSheet, BottomSheetItem, BottomSheetTitle, Button } from '@components/ui';
import { SUCCESS } from '@constants/colors';
import type { ProofOfDelivery } from '@types';

interface Props {
  visible: boolean;
  /** Whether this order was created with the signature requirement. */
  signatureRequired: boolean;
  /** What the driver has already uploaded — reopening never re-demands it. */
  submission: ProofOfDelivery['submission'] | undefined;
  /** The parent's "mark delivered" PATCH is in flight. */
  completing: boolean;
  onClose: () => void;
  onCapturePhoto: () => void;
  onCaptureSignature: () => void;
  onDelivered: () => void;
}

/** Trailing indicator: a check once captured, otherwise a "go here next" chevron. */
function RowState({ done, color }: { done: boolean; color: string }) {
  return done ? (
    <Ionicons name="checkmark-circle" size={22} color={SUCCESS} />
  ) : (
    <Ionicons name="chevron-forward" size={20} color={color} />
  );
}

/**
 * The gate on "mark delivered": a checklist of what this order still needs
 * before it can be closed. Each item opens its own full screen, because
 * photographing a parcel and handing a phone to a stranger to sign are two
 * different jobs and neither fits in a form field.
 */
export function PodCaptureSheet({
  visible,
  signatureRequired,
  submission,
  completing,
  onClose,
  onCapturePhoto,
  onCaptureSignature,
  onDelivered,
}: Props) {
  const { palette } = useTheme();
  const photoDone = Boolean(submission?.photo_path);
  const signatureDone = Boolean(submission?.signature_path);
  const recipient = submission?.recipient_name?.trim();
  const canMarkDelivered = photoDone && (!signatureRequired || signatureDone);

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <>
        <BottomSheetTitle>Proof of delivery</BottomSheetTitle>
        <Text className="px-5 pb-3 text-sm text-muted">
          {canMarkDelivered
            ? 'Everything is captured. You can close the job.'
            : 'Capture what this delivery needs, then mark it delivered.'}
        </Text>

        <BottomSheetItem
          icon={photoDone ? 'image' : 'camera'}
          title="Delivery photo"
          subtitle={photoDone ? 'Uploaded — tap to replace' : 'Photograph the parcel where you left it'}
          onPress={onCapturePhoto}
          trailing={<RowState done={photoDone} color={palette.muted} />}
          last={!signatureRequired}
        />

        {signatureRequired && (
          <BottomSheetItem
            icon={signatureDone ? 'create' : 'create-outline'}
            title="Recipient signature"
            subtitle={
              signatureDone
                ? recipient
                  ? `Signed by ${recipient} — tap to redo`
                  : 'Signed — tap to redo'
                : 'Hand the phone over to sign'
            }
            onPress={onCaptureSignature}
            trailing={<RowState done={signatureDone} color={palette.muted} />}
            last
          />
        )}

        <View className="gap-2 px-5 pt-4">
          <Button
            title="Mark delivered"
            loading={completing}
            disabled={!canMarkDelivered}
            onPress={onDelivered}
          />
          {!canMarkDelivered && (
            <Text className="text-center text-[13px] text-muted">
              {photoDone
                ? 'The recipient still needs to sign.'
                : signatureRequired && !signatureDone
                  ? 'A photo and a signature are still needed.'
                  : 'A delivery photo is still needed.'}
            </Text>
          )}
        </View>
      </>
    </BottomSheet>
  );
}