import '../global.css';
import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useAuthStore } from '@/store/auth';
import { useAppStore } from '@/store/app';
import { configureNotificationHandler, getDeepLinkFromNotification, setupAndroidChannel } from '@/lib/notifications';
import { getExpoPushToken } from '@/lib/notifications';
import { api } from '@/lib/api';

configureNotificationHandler();

function RootLayoutNav() {
  const { isAuthenticated, isLoading, initialize } = useAuthStore();
  const { serverUrl, isLocked, lockApp, lockTimeoutMs, _hasHydrated } = useAppStore();
  const segments = useSegments();
  const router = useRouter();
  const bgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Bootstrap on mount
  useEffect(() => {
    setupAndroidChannel();
    initialize();
  }, []);

  // Route guard — runs after hydration and auth state settle
  useEffect(() => {
    if (isLoading || !_hasHydrated) return;

    const inAuth = segments[0] === '(auth)';
    const inApp = segments[0] === '(app)';
    const onSetup = segments[0] === 'setup';
    const onLock = segments[0] === 'lock';

    if (!serverUrl && !onSetup) {
      router.replace('/setup');
      return;
    }
    if (serverUrl && !isAuthenticated && !inAuth) {
      router.replace('/(auth)/login');
      return;
    }
    if (serverUrl && isAuthenticated && isLocked && !onLock) {
      router.replace('/lock');
      return;
    }
    if (serverUrl && isAuthenticated && !isLocked && (inAuth || onLock || onSetup)) {
      router.replace('/(app)');
    }
  }, [isAuthenticated, isLoading, serverUrl, isLocked, segments, _hasHydrated]);

  // App lock on background
  useEffect(() => {
    if (lockTimeoutMs === 0) return;

    const handleStateChange = (state: AppStateStatus) => {
      if (state === 'background' || state === 'inactive') {
        bgTimer.current = setTimeout(() => lockApp(), lockTimeoutMs);
      } else if (state === 'active') {
        if (bgTimer.current) {
          clearTimeout(bgTimer.current);
          bgTimer.current = null;
        }
      }
    };

    const sub = AppState.addEventListener('change', handleStateChange);
    return () => {
      sub.remove();
      if (bgTimer.current) clearTimeout(bgTimer.current);
    };
  }, [lockTimeoutMs]);

  // Push notification tap → deep link
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const deepLink = getDeepLinkFromNotification(response);
      if (deepLink) router.push(deepLink as Parameters<typeof router.push>[0]);
    });
    return () => sub.remove();
  }, []);

  // Register push token after auth
  useEffect(() => {
    if (!isAuthenticated) return;
    getExpoPushToken().then((token) => {
      if (token) {
        const platform = require('react-native').Platform.OS === 'ios' ? 'ios' : 'android';
        api.registerPushToken(token, platform).catch(() => {});
      }
    });
  }, [isAuthenticated]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="setup" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(app)" />
      <Stack.Screen name="lock" />
      <Stack.Screen name="checkin-confirm" />
      <Stack.Screen name="verify" />
      <Stack.Screen name="reset-password" />
    </Stack>
  );
}

export default function RootLayout() {
  return <RootLayoutNav />;
}
