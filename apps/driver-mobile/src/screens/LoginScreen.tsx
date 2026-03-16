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
import { login } from '../services/api';
import { registerFcmToken } from '../services/fcm';

interface Props {
  onLoginSuccess: () => void;
}

export function LoginScreen({ onLoginSuccess }: Props) {
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
      className="flex-1 bg-white"
    >
      <View className="flex-1 justify-center px-8">
        <Text className="text-3xl font-bold text-gray-900 text-center mb-2">
          Dispatch Driver
        </Text>
        <Text className="text-base text-gray-500 text-center mb-10">
          Sign in to your driver account
        </Text>

        <View className="space-y-4">
          <View>
            <Text className="text-sm font-medium text-gray-700 mb-1">Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="driver@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base text-gray-900 bg-gray-50"
            />
          </View>

          <View>
            <Text className="text-sm font-medium text-gray-700 mb-1">Password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              secureTextEntry
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base text-gray-900 bg-gray-50"
            />
          </View>
        </View>

        <TouchableOpacity
          onPress={handleLogin}
          disabled={isLoading}
          className="mt-8 bg-blue-600 rounded-lg py-4 items-center"
          style={{ opacity: isLoading ? 0.6 : 1 }}
        >
          {isLoading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white text-base font-semibold">Sign in</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
