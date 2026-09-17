import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useReminderLead } from '@hooks/useReminderLead';
import {
  DATE_ONLY_REMINDER_HOUR,
  MAX_REMINDER_LEAD,
  REMINDER_LEAD_OPTIONS,
  formatReminderLead,
  getReminderPermissionStatus,
  isValidReminderLead,
  openExactAlarmSettings,
  openNotificationPermissionSettings,
  type ReminderPermissionStatus,
} from '@services/reminders';
import { useTheme } from '@theme';

// Same switch that enables the server IP override: dev builds, or test APKs built with the flag.
const CUSTOM_LEAD_ENABLED = __DEV__ || process.env['EXPO_PUBLIC_ALLOW_SERVER_OVERRIDE'] === 'true';

/** Lead-time picker for on-device order reminders, with permission problems surfaced inline. */
export function ReminderSettings() {
  const { palette } = useTheme();
  const [lead, setLead] = useReminderLead();
  const [status, setStatus] = useState<ReminderPermissionStatus | null>(null);

  const isPreset = REMINDER_LEAD_OPTIONS.includes(lead);
  const [customOpen, setCustomOpen] = useState(CUSTOM_LEAD_ENABLED && !isPreset);
  const [customText, setCustomText] = useState(isPreset ? '' : String(lead));
  const [customError, setCustomError] = useState('');

  const refreshStatus = useCallback(() => {
    void getReminderPermissionStatus().then(setStatus);
  }, []);

  // Re-check on return from the system settings screen.
  useEffect(() => {
    refreshStatus();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshStatus();
    });
    return () => subscription.remove();
  }, [refreshStatus]);

  function choosePreset(option: number) {
    setCustomOpen(false);
    setCustomError('');
    setLead(option);
  }

  function applyCustom() {
    const minutes = Number(customText.trim());
    if (!customText.trim() || !isValidReminderLead(minutes) || minutes === 0) {
      setCustomError(`Enter whole minutes from 1 to ${MAX_REMINDER_LEAD}.`);
      return;
    }
    setCustomError('');
    setLead(minutes);
  }

  const enabled = lead > 0;
  const customActive = CUSTOM_LEAD_ENABLED && (customOpen || !isPreset);

  return (
    <View className="gap-3">
      <View className="gap-4 rounded-xl border border-border bg-card p-4">
        <View className="flex-row items-start gap-3">
          <Ionicons name="alarm-outline" size={20} color={palette.primary} />
          <View className="flex-1">
            <Text className="text-base font-semibold text-foreground">Remind me before a stop</Text>
            <Text className="mt-0.5 text-xs leading-4 text-muted">
              Works without internet. Applies to the next pickup or drop of every order you've accepted.
            </Text>
          </View>
        </View>

        <View className="flex-row flex-wrap gap-2">
          {REMINDER_LEAD_OPTIONS.map((option) => {
            const active = option === lead && !customOpen;
            return (
              <TouchableOpacity
                key={option}
                onPress={() => choosePreset(option)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={option === 0 ? 'Reminders off' : `Remind ${formatReminderLead(option)} before`}
                className={`rounded-full px-4 py-2 ${active ? 'bg-primary' : 'bg-input'}`}
              >
                <Text className={`text-sm font-semibold ${active ? 'text-primary-foreground' : 'text-muted'}`}>
                  {formatReminderLead(option)}
                </Text>
              </TouchableOpacity>
            );
          })}

          {CUSTOM_LEAD_ENABLED ? (
            <TouchableOpacity
              onPress={() => setCustomOpen(true)}
              accessibilityRole="button"
              accessibilityState={{ selected: customActive }}
              accessibilityLabel="Custom reminder time, for testing"
              className={`flex-row items-center gap-1.5 rounded-full border border-dashed px-4 py-2 ${
                customActive ? 'border-primary bg-primary' : 'border-border bg-input'
              }`}
            >
              <Ionicons name="flask-outline" size={14} color={customActive ? palette['primary-foreground'] : palette.muted} />
              <Text className={`text-sm font-semibold ${customActive ? 'text-primary-foreground' : 'text-muted'}`}>
                {!isPreset ? formatReminderLead(lead) : 'Custom'}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {CUSTOM_LEAD_ENABLED && customOpen ? (
          <View className="gap-2 rounded-lg border border-dashed border-border p-3">
            <Text className="text-xs font-semibold text-foreground">Custom lead time (test builds only)</Text>
            <View className="flex-row items-center gap-2">
              <TextInput
                value={customText}
                onChangeText={(text) => {
                  setCustomText(text.replace(/[^0-9]/g, ''));
                  setCustomError('');
                }}
                onSubmitEditing={applyCustom}
                keyboardType="number-pad"
                returnKeyType="done"
                maxLength={4}
                placeholder="Minutes, e.g. 2"
                placeholderTextColor={palette.muted}
                accessibilityLabel="Custom reminder minutes"
                className="h-10 flex-1 rounded-lg border border-border bg-background px-3 text-base"
                style={{ color: palette.foreground, paddingVertical: 0, textAlignVertical: 'center' }}
              />
              <TouchableOpacity
                onPress={applyCustom}
                accessibilityRole="button"
                className="h-10 items-center justify-center rounded-lg bg-primary px-4"
              >
                <Text className="text-sm font-semibold text-primary-foreground">Set</Text>
              </TouchableOpacity>
            </View>
            {customError ? (
              <Text className="text-xs text-red-500">{customError}</Text>
            ) : !isPreset ? (
              <Text className="text-xs text-muted">Reminding {formatReminderLead(lead)} before each timed stop.</Text>
            ) : null}
          </View>
        ) : null}

        {enabled ? (
          <Text className="text-xs leading-4 text-muted">
            Stops without a set time remind you at {DATE_ONLY_REMINDER_HOUR}:00 am that day.
          </Text>
        ) : null}

        {enabled && status?.notificationsBlocked ? (
          <PermissionNotice
            message="Notifications are turned off for this app, so reminders can't appear."
            action="Turn on notifications"
            onPress={() => void openNotificationPermissionSettings()}
          />
        ) : enabled && status?.exactAlarmsBlocked ? (
          <PermissionNotice
            message="Reminders may arrive a few minutes late until exact alarms are allowed."
            action="Allow exact alarms"
            onPress={() => void openExactAlarmSettings()}
          />
        ) : null}
      </View>
    </View>
  );
}

function PermissionNotice({ message, action, onPress }: { message: string; action: string; onPress: () => void }) {
  return (
    <View className="gap-2 rounded-lg bg-input p-3">
      <Text className="text-xs leading-4 text-foreground">{message}</Text>
      <TouchableOpacity onPress={onPress} accessibilityRole="button" hitSlop={8}>
        <Text className="text-sm font-semibold text-primary">{action}</Text>
      </TouchableOpacity>
    </View>
  );
}
