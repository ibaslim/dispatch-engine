import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@theme';
import type { ActivityStatus } from '@types';
import { PROGRESS_STEPS, progressIndex } from '@utils/orderProgress';

/**
 * Vertical stepper over the job's activity statuses. Completed steps get a
 * filled check, the current step a ring with its hint, and future steps a
 * hollow node — so the driver's next action is the only thing carrying weight.
 */
export function ProgressTimeline({ status }: { status: ActivityStatus }) {
  const { palette } = useTheme();
  const current = progressIndex(status);

  return (
    <View>
      {PROGRESS_STEPS.map((step, index) => {
        const isDone = index < current;
        const isCurrent = index === current;
        const isLast = index === PROGRESS_STEPS.length - 1;

        return (
          <View key={step.status} className="flex-row gap-3">
            <View className="items-center">
              {isDone ? (
                <View className="h-6 w-6 items-center justify-center rounded-full bg-primary">
                  <Ionicons name="checkmark" size={14} color={palette['primary-foreground']} />
                </View>
              ) : isCurrent ? (
                <View className="h-6 w-6 items-center justify-center rounded-full border-2 border-primary bg-card">
                  <View className="h-2 w-2 rounded-full bg-primary" />
                </View>
              ) : (
                <View className="h-6 w-6 rounded-full border border-border bg-card" />
              )}
              {!isLast && <View className="w-px flex-1 bg-border" />}
            </View>

            <View className={isLast ? 'flex-1' : 'flex-1 pb-5'}>
              <Text
                className={
                  isCurrent
                    ? 'text-[15px] font-bold text-foreground'
                    : isDone
                      ? 'text-[15px] text-foreground'
                      : 'text-[15px] text-muted'
                }
              >
                {step.label}
              </Text>
              {isCurrent && (
                <Text className="mt-0.5 text-[13px] text-muted">{step.hint}</Text>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}
