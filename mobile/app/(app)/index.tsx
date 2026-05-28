/**
 * Dashboard screen
 * Shows: greeting, switch status, check-in button, stats row, recent vaults.
 */
import { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LockKeyhole, Users, Clock } from 'lucide-react-native';
import { api } from '@/lib/api';
import { useVaultStore } from '@/store/vault';
import { useAuthStore } from '@/store/auth';
import type { SwitchSettings, Beneficiary } from '@/types';

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

function formatLastCheckin(ts: string | null): string {
  if (!ts) return 'Never';
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays}d ago`;
}

export default function DashboardScreen() {
  const [switchSettings, setSwitchSettings] = useState<SwitchSettings | null>(null);
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [error, setError] = useState('');
  const insets = useSafeAreaInsets();
  const { user, mek } = useAuthStore();
  const { vaults, loadVaults } = useVaultStore();
  const router = useRouter();

  const load = useCallback(async () => {
    try {
      const [s, b] = await Promise.all([
        api.getSwitch(),
        api.listBeneficiaries(),
      ]);
      setSwitchSettings(s);
      setBeneficiaries(b);
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
    setError('');
    try {
      const s = await api.checkIn();
      setSwitchSettings(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Check-in failed.');
    } finally {
      setCheckingIn(false);
    }
  };

  const firstName = user?.display_name?.split(' ')[0] ?? null;
  const isOverdue =
    switchSettings?.next_checkin_deadline &&
    new Date(switchSettings.next_checkin_deadline) < new Date();
  const recentVaults = vaults.slice(0, 3);

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
      {/* Greeting */}
      <Text className="text-2xl font-semibold text-text-primary dark:text-dark-text-primary text-center">
        Welcome back{firstName ? `, ${firstName}` : ''}.
      </Text>
      <Text className="text-sm text-text-secondary dark:text-dark-text-secondary mt-1 mb-6 text-center">
        {switchSettings?.status === 'active' ? 'Your vault is active and protected.' : 'Set up your vault to get started.'}
      </Text>

      {/* Switch status card */}
      <View className={`rounded-xl p-5 mb-3 ${isOverdue ? 'bg-destructive/10' : 'bg-surface dark:bg-dark-surface'}`}>
        <Text className="text-sm font-medium text-text-secondary dark:text-dark-text-secondary mb-1">
          Next check-in due
        </Text>
        <Text className={`text-3xl font-bold mb-2 ${isOverdue ? 'text-destructive' : 'text-text-primary dark:text-dark-text-primary'}`}>
          {formatDeadline(switchSettings?.next_checkin_deadline ?? null)}
        </Text>
        <Text className="text-sm text-text-secondary dark:text-dark-text-secondary capitalize">
          Status: {switchSettings?.status ?? '—'}
        </Text>
      </View>

      {/* Check-in button */}
      <TouchableOpacity
        className={`rounded-xl py-4 items-center mb-6 ${isOverdue ? 'bg-destructive' : 'bg-primary'}`}
        onPress={handleCheckIn}
        disabled={checkingIn}
      >
        <Text className="text-white font-semibold text-base">
          {checkingIn ? 'Checking in…' : "I'm okay — reset my timer"}
        </Text>
      </TouchableOpacity>

      {error ? (
        <Text className="text-destructive text-sm text-center mb-4">{error}</Text>
      ) : null}

      {/* Stats row */}
      <View className="flex-row gap-3 mb-6">
        <TouchableOpacity
          className="flex-1 bg-surface dark:bg-dark-surface rounded-xl p-4"
          onPress={() => router.push('/(app)/vaults')}
        >
          <LockKeyhole size={16} color="#9A9490" />
          <Text className="text-xs font-medium text-text-secondary dark:text-dark-text-secondary uppercase mt-2 mb-1">Vaults</Text>
          <Text className="text-2xl font-semibold text-text-primary dark:text-dark-text-primary">{vaults.length}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          className="flex-1 bg-surface dark:bg-dark-surface rounded-xl p-4"
          onPress={() => router.push('/(app)/beneficiaries')}
        >
          <Users size={16} color="#9A9490" />
          <Text className="text-xs font-medium text-text-secondary dark:text-dark-text-secondary uppercase mt-2 mb-1">Beneficiaries</Text>
          <Text className="text-2xl font-semibold text-text-primary dark:text-dark-text-primary">{beneficiaries.length}</Text>
        </TouchableOpacity>
        <View className="flex-1 bg-surface dark:bg-dark-surface rounded-xl p-4">
          <Clock size={16} color="#9A9490" />
          <Text className="text-xs font-medium text-text-secondary dark:text-dark-text-secondary uppercase mt-2 mb-1">Last check-in</Text>
          <Text className="text-base font-semibold text-text-primary dark:text-dark-text-primary">
            {formatLastCheckin(switchSettings?.last_checkin_at ?? null)}
          </Text>
        </View>
      </View>

      {/* Recent vaults */}
      {recentVaults.length > 0 && (
        <View>
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-xs font-medium text-text-secondary dark:text-dark-text-secondary uppercase tracking-wide">
              Your vaults
            </Text>
            <TouchableOpacity onPress={() => router.push('/(app)/vaults')}>
              <Text className="text-primary text-sm">View all</Text>
            </TouchableOpacity>
          </View>
          {recentVaults.map((vault) => (
            <TouchableOpacity
              key={vault.id}
              className="bg-surface dark:bg-dark-surface rounded-xl px-4 py-3 mb-2 flex-row items-center"
              onPress={() => router.push(`/(app)/vaults/${vault.id}`)}
            >
              <Text className="text-xl mr-3">{vault.icon || '🔒'}</Text>
              <View className="flex-1">
                <Text className="text-sm font-medium text-text-primary dark:text-dark-text-primary">{vault.name}</Text>
                {vault.description ? (
                  <Text className="text-xs text-text-secondary dark:text-dark-text-secondary" numberOfLines={1}>{vault.description}</Text>
                ) : null}
              </View>
              <Text className="text-text-secondary dark:text-dark-text-secondary text-base">›</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
