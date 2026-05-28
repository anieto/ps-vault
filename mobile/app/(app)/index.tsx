/**
 * Dashboard screen
 * Shows: switch status, next check-in deadline, check-in button, overdue state.
 */
import { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { api } from '@/lib/api';
import { useVaultStore } from '@/store/vault';
import { useAuthStore } from '@/store/auth';
import type { SwitchSettings } from '@/types';

function formatDeadline(deadline: string | null): string {
  if (!deadline) return '—';
  const d = new Date(deadline);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  if (diffMs < 0) return 'Overdue';
  const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHrs < 24) return `${diffHrs}h ${Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))}m`;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return `${diffDays} day${diffDays !== 1 ? 's' : ''}`;
}

export default function DashboardScreen() {
  const [switchSettings, setSwitchSettings] = useState<SwitchSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [error, setError] = useState('');
  const insets = useSafeAreaInsets();
  const { mek } = useAuthStore();
  const { loadVaults } = useVaultStore();
  const router = useRouter();

  const load = useCallback(async () => {
    try {
      const s = await api.getSwitch();
      setSwitchSettings(s);
      if (mek) await loadVaults(mek);
    } catch {
      setError('Failed to load status.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [mek]);

  useEffect(() => { load(); }, [load]);

  const handleCheckIn = async () => {
    setCheckingIn(true);
    try {
      const s = await api.checkIn();
      setSwitchSettings(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Check-in failed.');
    } finally {
      setCheckingIn(false);
    }
  };

  const isOverdue =
    switchSettings?.next_checkin_deadline &&
    new Date(switchSettings.next_checkin_deadline) < new Date();

  if (loading) {
    return (
      <View className="flex-1 bg-background dark:bg-dark-bg items-center justify-center">
        <ActivityIndicator color="#5B7FA6" />
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-background dark:bg-dark-bg"
      contentContainerStyle={{ padding: 24, paddingTop: insets.top + 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      <Text className="text-2xl font-semibold text-text-primary dark:text-dark-text-primary mb-6">
        Dashboard
      </Text>

      {/* Switch status card */}
      <View className={`rounded-xl p-5 mb-4 ${isOverdue ? 'bg-destructive/10' : 'bg-surface dark:bg-dark-surface'}`}>
        <Text className="text-sm font-medium text-text-secondary dark:text-dark-text-secondary mb-1">
          Next check-in due
        </Text>
        <Text className={`text-3xl font-bold mb-3 ${isOverdue ? 'text-destructive' : 'text-text-primary dark:text-dark-text-primary'}`}>
          {formatDeadline(switchSettings?.next_checkin_deadline ?? null)}
        </Text>
        <Text className="text-sm text-text-secondary dark:text-dark-text-secondary">
          Status: {switchSettings?.status ?? '—'}
        </Text>
      </View>

      {/* Check-in button */}
      <TouchableOpacity
        className="bg-primary rounded-xl py-4 items-center mb-6"
        onPress={handleCheckIn}
        disabled={checkingIn}
      >
        <Text className="text-white font-semibold text-lg">
          {checkingIn ? 'Checking in…' : "I'm okay — reset my timer"}
        </Text>
      </TouchableOpacity>

      {error ? (
        <Text className="text-destructive text-sm text-center mb-4">{error}</Text>
      ) : null}
    </ScrollView>
  );
}
