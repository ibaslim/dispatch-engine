import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { login } from '@services/api';
import { registerFcmToken } from '@services/notifications';
import { useTheme } from '@theme';

interface Props {
  onLoginSuccess: () => void;
  onOpenSettings: () => void;
}

export function LoginScreen({ onLoginSuccess, onOpenSettings }: Props) {
  const { palette } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function handleLogin() {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Validation', 'Please enter your email and password.');
      return;
    }
    setIsLoading(true);
    try {
      await login(email.trim(), password);
      // Register FCM token after successful login (fire-and-forget)
      registerFcmToken().catch(console.error);
      onLoginSuccess();
    } catch (err: unknown) {
      Alert.alert(
        'Login failed',
        err instanceof Error ? err.message : 'Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-background"
    >
      <SafeAreaView className="flex-1">
        <View className="flex-row justify-end px-5 pt-2">
          <TouchableOpacity
            onPress={onOpenSettings}
            hitSlop={12}
            accessibilityLabel="Appearance settings"
          >
            <Text className="text-sm font-medium text-primary">Appearance</Text>
          </TouchableOpacity>
        </View>

        <View className="flex-1 justify-center px-8">
          <Text className="text-3xl font-bold text-foreground text-center mb-2">
            Dispatch Driver
          </Text>
          <Text className="text-base text-muted text-center mb-10">
            Sign in to your driver account
          </Text>

          <View className="gap-4">
            <View>
              <Text className="text-sm font-medium text-foreground mb-1">Email</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="driver@example.com"
                placeholderTextColor={palette.muted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                className="w-full border border-border rounded-lg px-4 py-3 text-base text-foreground bg-input"
              />
            </View>

            <View>
              <Text className="text-sm font-medium text-foreground mb-1">Password</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={palette.muted}
                secureTextEntry
                className="w-full border border-border rounded-lg px-4 py-3 text-base text-foreground bg-input"
              />
            </View>
          </View>

          <TouchableOpacity
            onPress={handleLogin}
            disabled={isLoading}
            className="mt-8 bg-primary rounded-lg py-4 items-center"
            style={{ opacity: isLoading ? 0.6 : 1 }}
          >
            {isLoading ? (
              <ActivityIndicator color={palette['primary-foreground']} />
            ) : (
              <Text className="text-primary-foreground text-base font-semibold">
                Sign in
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}
