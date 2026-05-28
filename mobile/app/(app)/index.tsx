import { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LockKeyhole, Users, Clock, AlertTriangle, CheckCircle2, PauseCircle } from 'lucide-react-native';
import { api } from '@/lib/api';
import { useVaultStore } from '@/store/vault';
import { useAuthStore } from '@/store/auth';
import type { SwitchSettings, Beneficiary } from '@/types';

function formatLastCheckin(ts: string | null): string {
  if (!ts) return 'Never';
  const diffMs = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatCountdown(deadline: string): string {
  const diffMs = new Date(deadline).getTime() - Date.now();
  if (diffMs <= 0) return 'now';
  const hrs = Math.floor(diffMs / (1000 * 60 * 60));
  if (hrs < 24) return `${hrs}h ${Math.floor((diffMs % (1000 * 60 * 60)) / 60000)}m`;
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return `${days} day${days !== 1 ? 's' : ''}`;
}

function formatRelative(ts: string): string {
  const diffMs = new Date(ts).getTime() - Date.now();
  const hrs = Math.abs(Math.floor(diffMs / (1000 * 60 * 60)));
  const mins = Math.abs(Math.floor((diffMs % (1000 * 60 * 60)) / 60000));
  if (diffMs > 0) return hrs > 0 ? `in about ${hrs}h` : `in ${mins}m`;
  return hrs > 0 ? `${hrs}h ago` : `${mins}m ago`;
}

function SwitchStatusCard({
  sw,
  onUpdated,
}: {
  sw: SwitchSettings | null;
  onUpdated: (s: SwitchSettings) => void;
}) {
  const router = useRouter();
  const [checkingIn, setCheckingIn] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const handleCheckIn = async () => {
    setCheckingIn(true);
    try {
      const s = await api.checkIn();
      onUpdated(s);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Check-in failed.');
    } finally {
      setCheckingIn(false);
    }
  };

  const handleRevoke = () => {
    Alert.alert(
      'Revoke access',
      'This will immediately invalidate all active delivery links. Beneficiaries will no longer be able to access your vault.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke', style: 'destructive',
          onPress: async () => {
            setRevoking(true);
            try {
              const result = await api.revokeDeliveries();
              const n = result.revoked;
              Alert.alert('Done', n > 0 ? `Access revoked. ${n} delivery link${n === 1 ? '' : 's'} invalidated.` : 'No active delivery links to revoke.');
              const s = await api.getSwitch();
              onUpdated(s);
            } catch (err) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Failed to revoke access.');
            } finally {
              setRevoking(false);
            }
          },
        },
      ]
    );
  };

  // Inactive
  if (!sw || sw.status === 'inactive') {
    return (
      <View className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 flex-row items-start gap-3 mb-4">
        <AlertTriangle size={18} color="#d97706" style={{ marginTop: 2 }} />
        <View className="flex-1">
          <Text style={{ fontSize: 14, fontWeight: '600', color: '#92400e' }}>Your switch is not active</Text>
          <Text style={{ fontSize: 12, color: '#b45309', marginTop: 2 }}>Add a vault and beneficiary to activate your Emergency Release Switch.</Text>
        </View>
        <TouchableOpacity
          className="border border-amber-300 rounded-lg px-3 py-1.5"
          onPress={() => router.push('/(app)/settings')}
        >
          <Text style={{ fontSize: 13, fontWeight: '500', color: '#b45309' }}>Set up</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Paused
  if (sw.status === 'paused') {
    return (
      <View className="rounded-xl border border-border bg-surface dark:bg-dark-surface px-4 py-4 flex-row items-start gap-3 mb-4">
        <PauseCircle size={18} color="#9A9490" style={{ marginTop: 2 }} />
        <View className="flex-1">
          <Text style={{ fontSize: 14, fontWeight: '600' }} className="text-text-primary dark:text-dark-text-primary">Switch is paused</Text>
          <Text style={{ fontSize: 12 }} className="text-text-secondary dark:text-dark-text-secondary mt-0.5">
            {sw.paused_until ? `Resumes ${formatRelative(sw.paused_until)}` : 'Paused indefinitely'}
          </Text>
        </View>
        <TouchableOpacity
          className="border border-border rounded-lg px-3 py-1.5"
          onPress={() => router.push('/(app)/settings')}
        >
          <Text style={{ fontSize: 13, fontWeight: '500' }} className="text-text-primary dark:text-dark-text-primary">Manage</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Triggered
  if (sw.status === 'triggered') {
    const abortWindowOpen = sw.abort_deadline ? new Date(sw.abort_deadline) > new Date() : false;
    return (
      <View className="rounded-xl border border-destructive bg-destructive/5 px-4 py-4 flex-row items-start gap-3 mb-4">
        <AlertTriangle size={18} color="#ef4444" style={{ marginTop: 2 }} />
        <View className="flex-1">
          <Text style={{ fontSize: 14, fontWeight: '600' }} className="text-destructive">Your switch has triggered</Text>
          <Text style={{ fontSize: 12, marginTop: 2 }} className="text-destructive/80">
            {abortWindowOpen
              ? `Abort window closes ${formatRelative(sw.abort_deadline!)}`
              : 'Delivery in progress'}
          </Text>
        </View>
        <View className="flex-row gap-2 flex-shrink-0">
          <TouchableOpacity
            className="border border-destructive/40 rounded-lg px-3 py-1.5"
            onPress={handleRevoke}
            disabled={revoking}
          >
            {revoking
              ? <ActivityIndicator size="small" color="#ef4444" />
              : <Text style={{ fontSize: 13, fontWeight: '500' }} className="text-destructive">Revoke access</Text>}
          </TouchableOpacity>
          {abortWindowOpen && (
            <TouchableOpacity
              className="bg-destructive rounded-lg px-3 py-1.5"
              onPress={() => router.push('/(app)/settings')}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#fff' }}>I'm here</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  // Active — check overdue / urgent / normal
  const hoursUntil = sw.next_checkin_deadline
    ? (new Date(sw.next_checkin_deadline).getTime() - Date.now()) / (1000 * 60 * 60)
    : null;
  const isOverdue = hoursUntil !== null && hoursUntil < 0;
  const isUrgent = !isOverdue && hoursUntil !== null && hoursUntil < 24;

  if (isOverdue) {
    return (
      <View className="rounded-xl border border-destructive bg-destructive/5 px-4 py-4 flex-row items-start gap-3 mb-4">
        <AlertTriangle size={18} color="#ef4444" style={{ marginTop: 2 }} />
        <View className="flex-1">
          <Text style={{ fontSize: 14, fontWeight: '600' }} className="text-destructive">Check-in overdue</Text>
          <Text style={{ fontSize: 12, marginTop: 2 }} className="text-destructive/80">
            Your check-in window has passed. Check in now to prevent vault delivery.
          </Text>
        </View>
        <View className="flex-row gap-2 flex-shrink-0">
          <TouchableOpacity
            className="border border-destructive/40 rounded-lg px-3 py-1.5"
            onPress={handleRevoke}
            disabled={revoking}
          >
            {revoking
              ? <ActivityIndicator size="small" color="#ef4444" />
              : <Text style={{ fontSize: 12, fontWeight: '500' }} className="text-destructive">Revoke</Text>}
          </TouchableOpacity>
          <TouchableOpacity
            className="bg-destructive rounded-lg px-3 py-1.5"
            onPress={handleCheckIn}
            disabled={checkingIn}
          >
            {checkingIn
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={{ fontSize: 12, fontWeight: '600', color: '#fff' }}>Check in now</Text>}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Urgent or normal active
  const borderColor = isUrgent ? 'border-amber-300' : 'border-border';
  const bgColor = isUrgent ? 'bg-amber-50' : 'bg-surface dark:bg-dark-surface';
  const iconColor = isUrgent ? '#d97706' : '#22c55e';
  const titleColor = isUrgent ? '#92400e' : undefined;
  const subtitleColor = isUrgent ? '#b45309' : undefined;
  const daysUntil = hoursUntil !== null ? Math.floor(hoursUntil / 24) : null;

  return (
    <View className={`rounded-xl border ${borderColor} ${bgColor} px-4 py-4 flex-row items-center gap-3 mb-4`}>
      <CheckCircle2 size={18} color={iconColor} />
      <View className="flex-1">
        <Text style={{ fontSize: 14, fontWeight: '600', color: titleColor }} className={!isUrgent ? 'text-text-primary dark:text-dark-text-primary' : ''}>
          Switch is active
        </Text>
        <Text style={{ fontSize: 12, color: subtitleColor, marginTop: 2 }} className={!isUrgent ? 'text-text-secondary dark:text-dark-text-secondary' : ''}>
          {sw.next_checkin_deadline
            ? isUrgent
              ? `Check in soon — due in ${formatCountdown(sw.next_checkin_deadline)}`
              : `Next check-in due ${daysUntil && daysUntil > 0 ? `in ${daysUntil} day${daysUntil === 1 ? '' : 's'}` : 'today'}`
            : 'Waiting for first check-in'}
        </Text>
      </View>
      <TouchableOpacity
        className={`rounded-lg px-3 py-1.5 ${isUrgent ? 'bg-amber-500' : 'border border-border'}`}
        onPress={handleCheckIn}
        disabled={checkingIn}
      >
        {checkingIn
          ? <ActivityIndicator size="small" color={isUrgent ? '#fff' : '#5B7FA6'} />
          : <Text style={{ fontSize: 13, fontWeight: '600', color: isUrgent ? '#fff' : undefined }} className={!isUrgent ? 'text-text-primary dark:text-dark-text-primary' : ''}>Check in</Text>}
      </TouchableOpacity>
    </View>
  );
}

export default function DashboardScreen() {
  const [switchSettings, setSwitchSettings] = useState<SwitchSettings | null>(null);
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const insets = useSafeAreaInsets();
  const { user, mek } = useAuthStore();
  const { vaults, loadVaults } = useVaultStore();
  const router = useRouter();

  const load = useCallback(async () => {
    try {
      const [s, b] = await Promise.all([api.getSwitch(), api.listBeneficiaries()]);
      setSwitchSettings(s);
      setBeneficiaries(b);
      if (mek) await loadVaults(mek);
    } catch {
      // silently fail on refresh — data may already be populated
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [mek]);

  useEffect(() => { load(); }, [load]);

  const firstName = user?.display_name?.split(' ')[0] ?? null;
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
      contentContainerStyle={{ padding: 24, paddingTop: insets.top + 16, paddingBottom: 32 }}
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
      <SwitchStatusCard sw={switchSettings} onUpdated={setSwitchSettings} />

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
