import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { registerFcmToken } from '@services/notifications';
import { useTheme } from '@theme';
import { Button, useToast } from '@components/ui';

interface Props {
  /** Performs the sign-in (wired to the auth context by the route). */
  onSubmit: (email: string, password: string) => Promise<void>;
  /** Called after a successful sign-in (navigate into the app). */
  onLoginSuccess: () => void;
  onOpenSettings: () => void;
  onOpenIpConfig?: () => void;
}

/** Platform serif for the display wordmark — no bundled font needed. */
const SERIF = Platform.select({ ios: 'Georgia', default: 'serif' });

type Field = 'email' | 'password';

export function LoginScreen({ onSubmit, onLoginSuccess, onOpenSettings, onOpenIpConfig }: Props) {
  const { palette } = useTheme();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [focused, setFocused] = useState<Field | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !isLoading;

  const fieldBorder = (field: Field) =>
    focused === field ? 'border-primary' : 'border-border';

  async function handleLogin() {
    Keyboard.dismiss();
    if (!canSubmit) return;
    setIsLoading(true);
    try {
      await onSubmit(email.trim(), password);
      // Register the push token after a successful login (fire-and-forget).
      registerFcmToken().catch(console.error);
      onLoginSuccess();
    } catch (err: unknown) {
      toast.show(
        err instanceof Error ? err.message : 'Something went wrong. Please try again.',
        { variant: 'error' }
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-background"
    >
      <SafeAreaView className="flex-1">
        {/* Top bar affordances — Server IP config and Appearance settings */}
        <View className="flex-row items-center justify-between px-5 pt-2">
          {onOpenIpConfig ? (
            <TouchableOpacity
              onPress={onOpenIpConfig}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Server IP Configuration"
              className="flex-row items-center gap-1.5 rounded-full px-3 py-1.5"
            >
              <Ionicons name="hardware-chip-outline" size={15} color={palette.primary} />
              <Text className="text-sm font-semibold text-primary">Server IP</Text>
            </TouchableOpacity>
          ) : <View />}

          <TouchableOpacity
            onPress={onOpenSettings}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Appearance settings"
            className="flex-row items-center gap-1.5 rounded-full px-3 py-1.5"
          >
            <Ionicons name="contrast-outline" size={15} color={palette.muted} />
            <Text className="text-sm font-medium text-muted">Appearance</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerClassName="flex-grow justify-center px-8 pb-8"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Signature: letterspaced kicker over a serif wordmark. */}
          <View className="mb-9">
            <Text className="text-xs font-semibold uppercase text-primary tracking-[3px]">
              Dispatch Engine
            </Text>
            <Text
              className="mt-2 text-6xl text-foreground"
              style={{ fontFamily: SERIF, fontWeight: '700' }}
            >
              Driver
            </Text>
            <Text className="mt-3 text-base leading-6 text-muted max-w-[300px]">
              Sign in with the credentials your dispatcher gave you.
            </Text>
          </View>

          <View className="gap-4">
            <View>
              <Text className="mb-1.5 text-sm font-medium text-foreground">Email</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                onFocus={() => setFocused('email')}
                onBlur={() => setFocused(null)}
                placeholder="you@example.com"
                placeholderTextColor={palette.muted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="username"
                returnKeyType="next"
                editable={!isLoading}
                className={`w-full rounded-xl border ${fieldBorder('email')} bg-input px-4 py-3.5 text-base text-foreground`}
              />
            </View>

            <View>
              <Text className="mb-1.5 text-sm font-medium text-foreground">Password</Text>
              <View className="relative justify-center">
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  onFocus={() => setFocused('password')}
                  onBlur={() => setFocused(null)}
                  placeholder="••••••••"
                  placeholderTextColor={palette.muted}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoComplete="password"
                  textContentType="password"
                  returnKeyType="go"
                  onSubmitEditing={handleLogin}
                  editable={!isLoading}
                  className={`w-full rounded-xl border ${fieldBorder('password')} bg-input py-3.5 pl-4 pr-12 text-base text-foreground`}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword((v) => !v)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 h-full justify-center"
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={palette.muted}
                  />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <Button
            title="Log In"
            variant="primary"
            loading={isLoading}
            disabled={!canSubmit}
            onPress={handleLogin}
            className="mt-7"
          />

          <Text className="mt-6 text-center text-sm leading-5 text-muted">
            No account? Ask your dispatcher to add you in the admin portal.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}
