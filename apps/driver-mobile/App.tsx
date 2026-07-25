import './global.css';
import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from '@theme';
import { LoginScreen } from '@screens/LoginScreen';
import { JobsScreen } from '@screens/JobsScreen';
import { SettingsScreen } from '@screens/SettingsScreen';
import { getAccessToken } from '@services/storage';

function Root() {
  const { scheme, palette } = useTheme();
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    getAccessToken().then((token) => {
      setIsLoggedIn(!!token);
      setIsLoading(false);
    });
  }, []);

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {isLoading ? (
        <View className="flex-1 items-center justify-center bg-background">
          <ActivityIndicator size="large" color={palette.primary} />
        </View>
      ) : showSettings ? (
        <SettingsScreen onClose={() => setShowSettings(false)} />
      ) : isLoggedIn ? (
        <JobsScreen
          onLogout={() => setIsLoggedIn(false)}
          onOpenSettings={() => setShowSettings(true)}
        />
      ) : (
        <LoginScreen
          onLoginSuccess={() => setIsLoggedIn(true)}
          onOpenSettings={() => setShowSettings(true)}
        />
      )}
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <Root />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
