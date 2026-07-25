import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useColorScheme, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { vars } from 'nativewind';
import {
  buildVars,
  DEFAULT_MODE,
  DEFAULT_THEME,
  resolvePalette,
  type ColorScheme,
  type ThemeMode,
  type ThemeName,
  type TokenName,
} from './themes';

const MODE_KEY = 'driver.theme.mode';
const NAME_KEY = 'driver.theme.name';

interface ThemeContextValue {
  /** User preference: 'light' | 'dark' | 'system'. */
  mode: ThemeMode;
  /** Selected accent theme. */
  themeName: ThemeName;
  /** Effective scheme after resolving 'system'. */
  scheme: ColorScheme;
  /** Resolved color strings for imperative props (e.g. ActivityIndicator). */
  palette: Record<TokenName, string>;
  setMode: (mode: ThemeMode) => void;
  setThemeName: (name: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>(DEFAULT_MODE);
  const [themeName, setThemeNameState] = useState<ThemeName>(DEFAULT_THEME);

  // Load persisted preferences once on mount.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [savedMode, savedName] = await AsyncStorage.multiGet([
          MODE_KEY,
          NAME_KEY,
        ]);
        if (!active) return;
        if (savedMode[1]) setModeState(savedMode[1] as ThemeMode);
        if (savedName[1]) setThemeNameState(savedName[1] as ThemeName);
      } catch {
        // Fall back to defaults if storage is unavailable.
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    AsyncStorage.setItem(MODE_KEY, next).catch(() => {});
  }, []);

  const setThemeName = useCallback((next: ThemeName) => {
    setThemeNameState(next);
    AsyncStorage.setItem(NAME_KEY, next).catch(() => {});
  }, []);

  // useColorScheme may return 'light' | 'dark' | 'unspecified' | null — treat
  // anything that isn't explicitly 'dark' as light.
  const systemResolved: ColorScheme = systemScheme === 'dark' ? 'dark' : 'light';
  const scheme: ColorScheme = mode === 'system' ? systemResolved : mode;

  const themeVars = useMemo(
    () => vars(buildVars(themeName, scheme)),
    [themeName, scheme]
  );
  const palette = useMemo(
    () => resolvePalette(themeName, scheme),
    [themeName, scheme]
  );

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, themeName, scheme, palette, setMode, setThemeName }),
    [mode, themeName, scheme, palette, setMode, setThemeName]
  );

  return (
    <ThemeContext.Provider value={value}>
      {/* Root view carries the theme's CSS variables; all descendants inherit
          them, so every token-based className updates when this changes. */}
      <View style={themeVars} className="flex-1 bg-background">
        {children}
      </View>
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}
