import './global.css';
import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LoginScreen } from './src/screens/LoginScreen';
import { JobsScreen } from './src/screens/JobsScreen';
import { getAccessToken } from './src/services/tokenStorage';

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    getAccessToken().then((token) => {
      setIsLoggedIn(!!token);
      setIsLoading(false);
    });
  }, []);

  if (isLoading) {
    return (
      <View className="flex-1 justify-center items-center bg-white">
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {isLoggedIn ? (
        <JobsScreen onLogout={() => setIsLoggedIn(false)} />
      ) : (
        <LoginScreen onLoginSuccess={() => setIsLoggedIn(true)} />
      )}
    </SafeAreaProvider>
  );
}
