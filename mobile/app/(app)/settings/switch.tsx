import { useState, useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, ActivityIndicator, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { CheckCircle2, PauseCircle, AlertTriangle, Clock } from 'lucide-react-native';
import { api } from '@/lib/api';
import { BackButton } from '@/components/nav-buttons';
import type { SwitchSettings } from '@/types';

function formatHour(h: number): string {
  const period = h < 12 ? 'AM' : 'PM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:00 ${period}`;
}

function formatDateTime(ts: string): string {
  const d = new Date(ts);
  return (
    d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) +
    ' at ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  );
}

function formatRelative(ts: string): string {
  const diffMs = new Date(ts).getTime() - Date.now();
  const hrs = Math.abs(Math.floor(diffMs / (1000 * 60 * 60)));
  const mins = Math.abs(Math.floor((diffMs % (1000 * 60 * 60)) / 60000));
  if (diffMs > 0) return hrs > 0 ? `in about ${hrs}h` : `in ${mins}m`;
  return hrs > 0 ? `${hrs}h ago` : `${mins}m ago`;
}

function formatLastCheckin(ts: string | null): string {
  if (!ts) return 'Never';
  const diffMs = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ---- Timing display ----
function SwitchTimingDisplay({ sw }: { sw: SwitchSettings }) {
  const rows = [
    { label: 'Check-in interval', value: `Every ${sw.check_in_interval_days} day${sw.check_in_interval_days === 1 ? '' : 's'}` },
    {
      label: 'Preferred check-in time',
      value: sw.preferred_checkin_hour !== null && sw.preferred_checkin_hour !== undefined
        ? formatHour(sw.preferred_checkin_hour)
        : 'Not set (any time)',
    },
    { label: 'First reminder', value: `${sw.reminder1_days_before} day${sw.reminder1_days_before === 1 ? '' : 's'} before deadline` },
    { label: 'Second reminder', value: `${sw.reminder2_hours_before} hour${sw.reminder2_hours_before === 1 ? '' : 's'} before deadline` },
    { label: 'Final warning', value: `${sw.final_warning_hours_before} hour${sw.final_warning_hours_before === 1 ? '' : 's'} before deadline` },
    { label: 'Abort window', value: `${sw.abort_window_hours} hour${sw.abort_window_hours === 1 ? '' : 's'} after trigger` },
  ];

  return (
    <View style={{ gap: 12 }}>
      {rows.map((row) => (
        <View key={row.label} className="flex-row items-start justify-between">
          <Text style={{ fontSize: 13 }} className="text-text-secondary dark:text-dark-text-secondary flex-1">{row.label}</Text>
          <Text style={{ fontSize: 13, fontWeight: '500' }} className="text-text-primary dark:text-dark-text-primary ml-4 text-right">{row.value}</Text>
        </View>
      ))}
    </View>
  );
}

// ---- Edit form ----
function SwitchEditForm({ sw, onDone }: { sw: SwitchSettings; onDone: (updated: SwitchSettings) => void }) {
  const [intervalDays, setIntervalDays] = useState(String(sw.check_in_interval_days));
  const [preferredHour, setPreferredHour] = useState(
    sw.preferred_checkin_hour !== null && sw.preferred_checkin_hour !== undefined
      ? String(sw.preferred_checkin_hour)
      : ''
  );
  const [reminder1, setReminder1] = useState(String(sw.reminder1_days_before));
  const [reminder2, setReminder2] = useState(String(sw.reminder2_hours_before));
  const [finalWarning, setFinalWarning] = useState(String(sw.final_warning_hours_before));
  const [abortWindow, setAbortWindow] = useState(String(sw.abort_window_hours));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const iv = parseInt(intervalDays, 10);
    const r1 = parseInt(reminder1, 10);
    const r2 = parseInt(reminder2, 10);
    const fw = parseInt(finalWarning, 10);
    const aw = parseInt(abortWindow, 10);
    const ph = preferredHour !== '' ? parseInt(preferredHour, 10) : null;

    if (isNaN(iv) || iv < 1 || iv > 365) return Alert.alert('Invalid', 'Check-in interval must be 1–365 days.');
    if (isNaN(r1) || r1 < 1 || r1 > 30) return Alert.alert('Invalid', 'First reminder must be 1–30 days.');
    if (isNaN(r2) || r2 < 1 || r2 > 72) return Alert.alert('Invalid', 'Second reminder must be 1–72 hours.');
    if (isNaN(fw) || fw < 1 || fw > 24) return Alert.alert('Invalid', 'Final warning must be 1–24 hours.');
    if (isNaN(aw) || aw < 0 || aw > 72) return Alert.alert('Invalid', 'Abort window must be 0–72 hours.');
    if (ph !== null && (isNaN(ph) || ph < 0 || ph > 23)) return Alert.alert('Invalid', 'Preferred hour must be 0–23.');

    setSaving(true);
    try {
      const hourPayload = ph !== null
        ? { preferred_checkin_hour: ph }
        : { clear_preferred_hour: true };
      const updated = await api.updateSwitch({
        check_in_interval_days: iv,
        reminder1_days_before: r1,
        reminder2_hours_before: r2,
        final_warning_hours_before: fw,
        abort_window_hours: aw,
        ...hourPayload,
      });
      onDone(updated);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, hint: string, value: string, onChange: (v: string) => void) => (
    <View key={label} style={{ marginBottom: 12 }}>
      <Text style={{ fontSize: 12, fontWeight: '500', marginBottom: 4 }} className="text-text-secondary dark:text-dark-text-secondary">
        {label}
      </Text>
      <TextInput
        className="border border-border dark:border-dark-border rounded-lg px-3 py-2.5 text-text-primary dark:text-dark-text-primary bg-background dark:bg-dark-bg"
        style={{ fontSize: 14 }}
        value={value}
        onChangeText={onChange}
        keyboardType="numeric"
        placeholder={hint}
        placeholderTextColor="#9A9490"
      />
    </View>
  );

  return (
    <View>
      {field('Check-in interval (days)', '1–365', intervalDays, setIntervalDays)}
      <View style={{ marginBottom: 12 }}>
        <Text style={{ fontSize: 12, fontWeight: '500', marginBottom: 4 }} className="text-text-secondary dark:text-dark-text-secondary">
          Preferred check-in time (hour 0–23, leave blank for any time)
        </Text>
        <TextInput
          className="border border-border dark:border-dark-border rounded-lg px-3 py-2.5 text-text-primary dark:text-dark-text-primary bg-background dark:bg-dark-bg"
          style={{ fontSize: 14 }}
          value={preferredHour}
          onChangeText={setPreferredHour}
          keyboardType="numeric"
          placeholder="e.g. 9 for 9:00 AM"
          placeholderTextColor="#9A9490"
        />
        {preferredHour !== '' && !isNaN(parseInt(preferredHour, 10)) && parseInt(preferredHour, 10) >= 0 && parseInt(preferredHour, 10) <= 23 && (
          <Text style={{ fontSize: 11, marginTop: 3 }} className="text-text-muted dark:text-dark-text-muted">
            {formatHour(parseInt(preferredHour, 10))}
          </Text>
        )}
      </View>
      {field('First reminder (days before deadline)', '1–30', reminder1, setReminder1)}
      {field('Second reminder (hours before deadline)', '1–72', reminder2, setReminder2)}
      {field('Final warning (hours before deadline)', '1–24', finalWarning, setFinalWarning)}
      {field('Abort window (hours after trigger)', '0–72', abortWindow, setAbortWindow)}
      <TouchableOpacity
        className="bg-primary rounded-lg py-3 items-center mt-2"
        onPress={handleSave}
        disabled={saving}
      >
        {saving
          ? <ActivityIndicator size="small" color="#fff" />
          : <Text style={{ fontSize: 14, fontWeight: '600', color: '#fff' }}>Save timing</Text>}
      </TouchableOpacity>
    </View>
  );
}

// ---- Pause form ----
function PauseSwitchForm({
  sw,
  onDone,
  onCancel,
}: {
  sw: SwitchSettings;
  onDone: (updated: SwitchSettings) => void;
  onCancel: () => void;
}) {
  const [saving, setSaving] = useState(false);

  const pause = async (days?: number) => {
    setSaving(true);
    try {
      const body: { resume_at?: string } = {};
      if (days !== undefined) {
        const resumeAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
        body.resume_at = resumeAt.toISOString();
      }
      const updated = await api.pauseSwitch(body);
      onDone(updated);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to pause switch.');
    } finally {
      setSaving(false);
    }
  };

  const options = [
    { label: '1 week', days: 7 },
    { label: '2 weeks', days: 14 },
    { label: '1 month', days: 30 },
    { label: 'Indefinitely', days: undefined },
  ];

  return (
    <View className="mt-3 p-3 rounded-lg border border-border dark:border-dark-border bg-surface-muted dark:bg-dark-bg">
      <Text style={{ fontSize: 14, fontWeight: '600', marginBottom: 4 }} className="text-text-primary dark:text-dark-text-primary">
        Pause switch
      </Text>
      <Text style={{ fontSize: 12, marginBottom: 12 }} className="text-text-secondary dark:text-dark-text-secondary">
        Use this during surgery, vacation, or any planned absence. No reminders or triggers will fire while paused.
      </Text>
      <View style={{ gap: 8 }}>
        {options.map((o) => (
          <TouchableOpacity
            key={o.label}
            className="border border-border dark:border-dark-border rounded-lg py-2.5 items-center"
            onPress={() => pause(o.days)}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator size="small" color="#5B7FA6" />
              : <Text style={{ fontSize: 14, fontWeight: '500' }} className="text-text-primary dark:text-dark-text-primary">{o.label}</Text>}
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          className="py-2 items-center"
          onPress={onCancel}
          disabled={saving}
        >
          <Text style={{ fontSize: 13 }} className="text-text-secondary dark:text-dark-text-secondary">Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ---- Main screen ----
export default function SwitchSettingsScreen() {
  const [sw, setSw] = useState<SwitchSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPauseForm, setShowPauseForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const load = useCallback(async () => {
    try {
      const s = await api.getSwitch();
      setSw(s);
    } catch {
      Alert.alert('Error', 'Failed to load switch settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading || !sw) {
    return (
      <View className="flex-1 bg-background dark:bg-dark-bg items-center justify-center">
        <ActivityIndicator color="#5B7FA6" />
      </View>
    );
  }

  const abortWindowOpen = sw.abort_deadline ? new Date(sw.abort_deadline) > new Date() : false;

  const handleCheckIn = async () => {
    setActionLoading(true);
    try {
      setSw(await api.checkIn());
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Check-in failed.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleActivate = async () => {
    setActionLoading(true);
    try {
      setSw(await api.updateSwitch({ is_active: true }));
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to activate switch.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResume = async () => {
    setActionLoading(true);
    try {
      setSw(await api.resumeSwitch());
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to resume switch.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleImHere = () => {
    Alert.alert(
      "I'm here",
      'This will cancel the delivery and reset your check-in timer.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: "I'm here",
          onPress: async () => {
            setActionLoading(true);
            try {
              setSw(await api.abortTrigger());
            } catch (err) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Failed to cancel delivery.');
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleRevokeAndReset = () => {
    Alert.alert(
      'Revoke & reset',
      'This will invalidate all active delivery links and reset your switch. Beneficiaries will lose portal access and your check-in timer will restart.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke & reset',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(true);
            try {
              await api.revokeDeliveries();
              await load();
            } catch (err) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Failed to revoke access.');
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const statusConfig = {
    active: { label: 'Active', color: '#22c55e', Icon: CheckCircle2 },
    paused: { label: 'Paused', color: '#9A9490', Icon: PauseCircle },
    triggered: { label: 'Triggered', color: '#ef4444', Icon: AlertTriangle },
    inactive: { label: 'Inactive', color: '#9A9490', Icon: Clock },
    delivered: { label: 'Delivered', color: '#9A9490', Icon: CheckCircle2 },
  };
  const sc = statusConfig[sw.status as keyof typeof statusConfig] ?? statusConfig.inactive;
  const { Icon } = sc;

  return (
    <ScrollView
      className="flex-1 bg-background dark:bg-dark-bg"
      contentContainerStyle={{ padding: 24, paddingTop: insets.top + 16, paddingBottom: 40 }}
    >
      <View className="relative flex-row items-center justify-center mb-6">
        <BackButton onPress={() => router.back()} />
        <Text className="text-xl font-semibold text-text-primary dark:text-dark-text-primary">
          Emergency Release Switch
        </Text>
      </View>

      {/* Status card */}
      <View className="bg-surface dark:bg-dark-surface rounded-xl p-4 mb-4">
        {/* Status row */}
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <Icon size={18} color={sc.color} />
            <Text style={{ color: sc.color, fontSize: 14, fontWeight: '600' }}>{sc.label}</Text>
          </View>

          {/* Action buttons */}
          {sw.status === 'active' && !showPauseForm && (
            <View className="flex-row gap-2">
              <TouchableOpacity
                className="border border-border dark:border-dark-border rounded-lg px-3 py-1.5"
                onPress={() => setShowPauseForm(true)}
              >
                <Text style={{ fontSize: 13, fontWeight: '500' }} className="text-text-primary dark:text-dark-text-primary">Pause</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="bg-primary rounded-lg px-3 py-1.5"
                onPress={handleCheckIn}
                disabled={actionLoading}
              >
                {actionLoading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={{ fontSize: 13, fontWeight: '600', color: '#fff' }}>Check in</Text>}
              </TouchableOpacity>
            </View>
          )}

          {sw.status === 'paused' && (
            <TouchableOpacity
              className="border border-border dark:border-dark-border rounded-lg px-3 py-1.5"
              onPress={handleResume}
              disabled={actionLoading}
            >
              {actionLoading
                ? <ActivityIndicator size="small" color="#5B7FA6" />
                : <Text style={{ fontSize: 13, fontWeight: '500' }} className="text-text-primary dark:text-dark-text-primary">Resume</Text>}
            </TouchableOpacity>
          )}

          {sw.status === 'inactive' && (
            <TouchableOpacity
              className="bg-primary rounded-lg px-3 py-1.5"
              onPress={handleActivate}
              disabled={actionLoading}
            >
              {actionLoading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={{ fontSize: 13, fontWeight: '600', color: '#fff' }}>Activate</Text>}
            </TouchableOpacity>
          )}

          {sw.status === 'triggered' && (
            abortWindowOpen ? (
              <TouchableOpacity
                className="bg-destructive rounded-lg px-3 py-1.5"
                onPress={handleImHere}
                disabled={actionLoading}
              >
                {actionLoading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={{ fontSize: 13, fontWeight: '600', color: '#fff' }}>I'm here</Text>}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                className="border border-destructive/40 rounded-lg px-3 py-1.5"
                onPress={handleRevokeAndReset}
                disabled={actionLoading}
              >
                {actionLoading
                  ? <ActivityIndicator size="small" color="#ef4444" />
                  : <Text style={{ fontSize: 13, fontWeight: '500' }} className="text-destructive">Revoke &amp; reset</Text>}
              </TouchableOpacity>
            )
          )}

          {sw.status === 'delivered' && (
            <TouchableOpacity
              className="border border-destructive/40 rounded-lg px-3 py-1.5"
              onPress={handleRevokeAndReset}
              disabled={actionLoading}
            >
              {actionLoading
                ? <ActivityIndicator size="small" color="#ef4444" />
                : <Text style={{ fontSize: 13, fontWeight: '500' }} className="text-destructive">Revoke &amp; reset</Text>}
            </TouchableOpacity>
          )}
        </View>

        {/* Triggered delivery notice */}
        {sw.status === 'triggered' && sw.abort_deadline && (
          <View className="mt-3 p-3 rounded-lg bg-destructive/5 border border-destructive/20">
            <Text style={{ fontSize: 13 }} className="text-destructive">
              <Text style={{ fontWeight: '600' }}>Your vaults will be delivered</Text>
              {` unless you abort by ${formatDateTime(sw.abort_deadline)}.`}
            </Text>
          </View>
        )}

        {/* Paused info */}
        {sw.status === 'paused' && (
          <Text style={{ fontSize: 12, marginTop: 8 }} className="text-text-secondary dark:text-dark-text-secondary">
            {sw.paused_until ? `Resumes ${formatRelative(sw.paused_until)}` : 'Paused indefinitely'}
          </Text>
        )}

        {/* Active info */}
        {sw.status === 'active' && sw.next_checkin_deadline && (
          <View style={{ marginTop: 10, gap: 4 }}>
            <View className="flex-row justify-between">
              <Text style={{ fontSize: 12 }} className="text-text-secondary dark:text-dark-text-secondary">Next check-in due</Text>
              <Text style={{ fontSize: 12, fontWeight: '500' }} className="text-text-primary dark:text-dark-text-primary">
                {formatRelative(sw.next_checkin_deadline)}
              </Text>
            </View>
            <View className="flex-row justify-between">
              <Text style={{ fontSize: 12 }} className="text-text-secondary dark:text-dark-text-secondary">Last check-in</Text>
              <Text style={{ fontSize: 12, fontWeight: '500' }} className="text-text-primary dark:text-dark-text-primary">
                {formatLastCheckin(sw.last_checkin_at)}
              </Text>
            </View>
            <Text style={{ fontSize: 11, marginTop: 2 }} className="text-text-muted dark:text-dark-text-muted">
              Logging in also counts as a check-in and resets the timer.
            </Text>
          </View>
        )}

        {/* Pause form */}
        {showPauseForm && (
          <PauseSwitchForm
            sw={sw}
            onDone={(updated) => { setSw(updated); setShowPauseForm(false); }}
            onCancel={() => setShowPauseForm(false)}
          />
        )}
      </View>

      {/* Timing configuration */}
      <View className="bg-surface dark:bg-dark-surface rounded-xl p-4">
        <View className="flex-row items-center justify-between mb-4">
          <Text style={{ fontSize: 15, fontWeight: '600' }} className="text-text-primary dark:text-dark-text-primary">
            Timing configuration
          </Text>
          <TouchableOpacity
            className="border border-border dark:border-dark-border rounded-lg px-3 py-1.5"
            onPress={() => setShowEditForm((v) => !v)}
          >
            <Text style={{ fontSize: 13, fontWeight: '500' }} className="text-text-primary dark:text-dark-text-primary">
              {showEditForm ? 'Cancel' : 'Edit'}
            </Text>
          </TouchableOpacity>
        </View>

        {showEditForm ? (
          <SwitchEditForm
            sw={sw}
            onDone={(updated) => { setSw(updated); setShowEditForm(false); }}
          />
        ) : (
          <SwitchTimingDisplay sw={sw} />
        )}
      </View>
    </ScrollView>
  );
}
