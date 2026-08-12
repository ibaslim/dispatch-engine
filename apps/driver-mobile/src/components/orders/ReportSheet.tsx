import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@theme';
import { BottomSheet, BottomSheetTitle, Button, useBottomSheetScroll } from '@components/ui';
import {
  DELIVERY_INCIDENT_REASONS,
  INCIDENT_REASONS_REQUIRING_DESCRIPTION,
  PICKUP_INCIDENT_REASONS,
  type IncidentReason,
  type IncidentStage,
} from '@types';

const REASON_LABELS: Record<IncidentReason, string> = {
  no_answer: 'No answer',
  wrong_address: 'Wrong address',
  business_closed: 'Business closed',
  parcel_issue: 'Problem with the parcel',
  refused: 'Delivery refused',
  other: 'Something else',
};

interface Props {
  visible: boolean;
  /** Derived from the job's progress — decides which reasons the API accepts. */
  stage: IncidentStage;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (reason: IncidentReason, description: string | null) => void;
}

/**
 * Report a problem at the current stop. The reason list comes from the API's
 * per-stage allow-list, and the description box appears only for the reasons the
 * API requires one for — so an invalid combination can't be submitted at all,
 * rather than round-tripping into a 400.
 */
export function ReportSheet({ visible, stage, submitting, onClose, onSubmit }: Props) {
  const { palette } = useTheme();
  const [reason, setReason] = useState<IncidentReason | null>(null);
  const [description, setDescription] = useState('');

  // Reset between openings so a previous draft never leaks into a new report.
  useEffect(() => {
    if (!visible) {
      setReason(null);
      setDescription('');
    }
  }, [visible]);

  const reasons = stage === 'pickup' ? PICKUP_INCIDENT_REASONS : DELIVERY_INCIDENT_REASONS;
  const needsDescription =
    reason !== null && INCIDENT_REASONS_REQUIRING_DESCRIPTION.includes(reason);
  const canSubmit =
    reason !== null && (!needsDescription || description.trim().length > 0);

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <>
        <BottomSheetTitle>
          {stage === 'pickup' ? 'Report a pickup issue' : 'Report a delivery issue'}
        </BottomSheetTitle>

        <View className="gap-2 px-5 pt-1">
          {reasons.map((option) => {
            const selected = option === reason;
            return (
              <TouchableOpacity
                key={option}
                onPress={() => setReason(option)}
                activeOpacity={0.8}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                className={
                  selected
                    ? 'flex-row items-center justify-between rounded-xl border border-primary bg-primary-muted px-4 py-3'
                    : 'flex-row items-center justify-between rounded-xl border border-border bg-card px-4 py-3'
                }
              >
                <Text
                  className={
                    selected
                      ? 'text-[15px] font-semibold text-primary-muted-foreground'
                      : 'text-[15px] text-foreground'
                  }
                >
                  {REASON_LABELS[option]}
                </Text>
                {selected && (
                  <Ionicons
                    name="checkmark-circle"
                    size={20}
                    color={palette['primary-muted-foreground']}
                  />
                )}
              </TouchableOpacity>
            );
          })}

          {needsDescription && (
            <DescriptionInput value={description} onChangeText={setDescription} />
          )}

          <Button
            title="Submit report"
            className="mt-2"
            loading={submitting}
            disabled={!canSubmit}
            onPress={() => reason && onSubmit(reason, description.trim() || null)}
          />
        </View>
      </>
    </BottomSheet>
  );
}

/**
 * Separate component so it can call `useBottomSheetScroll` — the context is
 * provided *inside* `BottomSheet`, so a hook call in `ReportSheet` itself would
 * only ever see the no-op default. On focus it scrolls the sheet down, keeping
 * the box and the Submit button above the keyboard.
 */
function DescriptionInput({
  value,
  onChangeText,
}: {
  value: string;
  onChangeText: (text: string) => void;
}) {
  const { palette } = useTheme();
  const { scrollToEnd } = useBottomSheetScroll();

  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      onFocus={scrollToEnd}
      placeholder="Describe what happened"
      placeholderTextColor={palette.muted}
      multiline
      className="mt-1 min-h-[88px] rounded-xl border border-border bg-input px-4 py-3 text-[15px] text-foreground"
      style={{ textAlignVertical: 'top' }}
    />
  );
}