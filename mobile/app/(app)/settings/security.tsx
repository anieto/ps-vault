import { useState } from 'react';
import { View, Text, Switch, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAppStore } from '@/store/app';
import { useAuthStore } from '@/store/auth';
import { BackButton } from '@/components/nav-buttons';

const LOCK_TIMEOUT_OPTIONS = [
  { label: 'Immediately', value: 0 },
  { label: '1 minute', value: 60 * 1000 },
  { label: '5 minutes', value: 5 * 60 * 1000 },
  { label: '15 minutes', value: 15 * 60 * 1000 },
  { label: 'Never', value: -1 },
];

const CLIPBOARD_TIMEOUT_OPTIONS = [
  { label: '15 seconds', value: 15 * 1000 },
  { label: '30 seconds', value: 30 * 1000 },
  { label: '1 minute', value: 60 * 1000 },
  { label: 'Never', value: -1 },
];

export default function SecuritySettingsScreen() {
  const {
    biometricEnabled,
    setBiometricEnabled,
    lockTimeoutMs,
    setLockTimeout,
    clipboardTimeoutMs,
    setClipboardTimeout,
  } = useAppStore();
  const { user } = useAuthStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView className="flex-1 bg-background dark:bg-dark-bg" contentContainerStyle={{ padding: 24, paddingTop: insets.top + 16 }}>
      <View className="relative flex-row items-center justify-center mb-6">
        <BackButton onPress={() => router.back()} />
        <Text className="text-xl font-semibold text-text-primary dark:text-dark-text-primary">
          Security
        </Text>
      </View>

      {/* Biometric */}
      <View className="bg-surface dark:bg-dark-surface rounded-xl p-4 mb-4">
        <View className="flex-row items-center justify-between mb-1">
          <Text className="text-base font-medium text-text-primary dark:text-dark-text-primary">
            Biometric unlock
          </Text>
          <Switch
            value={biometricEnabled}
            onValueChange={setBiometricEnabled}
            trackColor={{ true: '#5B7FA6' }}
          />
        </View>
        <Text className="text-sm text-text-secondary dark:text-dark-text-secondary">
          Use Face ID or Touch ID to unlock the app.
        </Text>
      </View>

      {/* App lock timeout */}
      <Text className="text-sm font-medium text-text-secondary dark:text-dark-text-secondary uppercase mb-2 px-1">
        App lock timeout
      </Text>
      <View className="bg-surface dark:bg-dark-surface rounded-xl overflow-hidden mb-4">
        {LOCK_TIMEOUT_OPTIONS.map((opt, i) => (
          <TouchableOpacity
            key={opt.value}
            className={`px-4 py-3 flex-row items-center justify-between ${i < LOCK_TIMEOUT_OPTIONS.length - 1 ? 'border-b border-border dark:border-dark-border' : ''}`}
            onPress={() => setLockTimeout(opt.value)}
          >
            <Text className="text-base text-text-primary dark:text-dark-text-primary">
              {opt.label}
            </Text>
            {lockTimeoutMs === opt.value && (
              <Text className="text-primary font-medium">✓</Text>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Clipboard timeout */}
      <Text className="text-sm font-medium text-text-secondary dark:text-dark-text-secondary uppercase mb-2 px-1">
        Clipboard auto-clear
      </Text>
      <View className="bg-surface dark:bg-dark-surface rounded-xl overflow-hidden mb-4">
        {CLIPBOARD_TIMEOUT_OPTIONS.map((opt, i) => (
          <TouchableOpacity
            key={opt.value}
            className={`px-4 py-3 flex-row items-center justify-between ${i < CLIPBOARD_TIMEOUT_OPTIONS.length - 1 ? 'border-b border-border dark:border-dark-border' : ''}`}
            onPress={() => setClipboardTimeout(opt.value)}
          >
            <Text className="text-base text-text-primary dark:text-dark-text-primary">
              {opt.label}
            </Text>
            {clipboardTimeoutMs === opt.value && (
              <Text className="text-primary font-medium">✓</Text>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* MFA */}
      <Text className="text-sm font-medium text-text-secondary dark:text-dark-text-secondary uppercase mb-2 px-1">
        Two-factor authentication
      </Text>
      <View className="bg-surface dark:bg-dark-surface rounded-xl p-4 mb-4">
        <View className="flex-row items-center justify-between mb-1">
          <Text className="text-base text-text-primary dark:text-dark-text-primary">
            Authenticator app
          </Text>
          <Text className={`text-sm font-medium ${user?.mfa_enabled ? 'text-success' : 'text-text-secondary dark:text-dark-text-secondary'}`}>
            {user?.mfa_enabled ? 'Enabled' : 'Disabled'}
          </Text>
        </View>
        {!user?.mfa_enabled && (
          <TouchableOpacity
            className="mt-3 bg-primary/10 rounded-lg py-2 items-center"
            onPress={() => router.push('/(auth)/mfa')}
          >
            <Text className="text-primary font-medium text-sm">Set up 2FA</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Phase 6: Passkeys section placeholder */}
      {/* TODO Phase 6: Add passkeys management here */}
    </ScrollView>
  );
}
