import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { PushNotificationData, PushNotificationType } from '@/types';

// ─── Setup ────────────────────────────────────────────────────────────────────

export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function setupAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('psvault', {
    name: 'P.S. Vault',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#5B7FA6',
  });
}

// ─── Token registration ───────────────────────────────────────────────────────

export async function requestPushPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function getExpoPushToken(): Promise<string | null> {
  const granted = await requestPushPermission();
  if (!granted) return null;

  try {
    const result = await Notifications.getExpoPushTokenAsync();
    return result.data;
  } catch {
    return null;
  }
}

// ─── Notification response handler ───────────────────────────────────────────
// Dispatch table — add Phase 6 types here without restructuring.

export function getDeepLinkFromNotification(
  response: Notifications.NotificationResponse
): string | null {
  const data = response.notification.request.content.data as PushNotificationData;
  if (!data?.type) return null;

  // deep_link from server takes priority
  if (data.deep_link) return data.deep_link;

  // Fallback map for types without explicit deep_link
  const fallbacks: Partial<Record<PushNotificationType, string>> = {
    checkin_reminder: '/checkin-confirm',
    checkin_warning: '/checkin-confirm',
    checkin_final: '/checkin-confirm',
    trigger_abort: '/(app)',
    // Phase 6:
    trusted_contact_alert: '/(app)',
    death_report_submitted: '/(app)',
    test_mode: '/(app)',
  };

  return fallbacks[data.type] ?? null;
}
