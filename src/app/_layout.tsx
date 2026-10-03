import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavigationThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { DATABASE_NAME, migrate } from '@/db/schema';
import { ThemeProvider, useTheme } from '@/theme/theme-context';

SplashScreen.preventAutoHideAsync();

function Shell() {
  const { scheme, colors } = useTheme();

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <NavigationThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <View style={[styles.root, { backgroundColor: colors.base }]}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.base },
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="article/[id]" />
        </Stack>
      </View>
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrate}>
      <ThemeProvider>
        <Shell />
      </ThemeProvider>
    </SQLiteProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
