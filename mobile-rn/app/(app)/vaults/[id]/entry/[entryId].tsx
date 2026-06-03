import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useVaultStore } from '@/store/vault';
import { decryptObject, encryptObject } from '@/lib/crypto';
import { api } from '@/lib/api';
import { BackButton, TextActionButton } from '@/components/nav-buttons';
import type { EntryType } from '@/types';

interface FieldDef { key: string; label: string; multiline?: boolean; sensitive?: boolean }

function getFieldsForType(type: EntryType): FieldDef[] {
  switch (type) {
    case 'contact':   return [
      { key: 'relationship', label: 'Relationship / Role' },
      { key: 'phone',        label: 'Phone number' },
      { key: 'email',        label: 'Email' },
      { key: 'address',      label: 'Address' },
      { key: 'notes',        label: 'Notes', multiline: true },
    ];
    case 'login':     return [
      { key: 'username', label: 'Username / Email' },
      { key: 'password', label: 'Password', sensitive: true },
      { key: 'url',      label: 'Website URL' },
      { key: 'notes',    label: 'Notes', multiline: true },
    ];
    case 'financial': return [
      { key: 'institution',      label: 'Institution' },
      { key: 'account_number',   label: 'Account number' },
      { key: 'account_type',     label: 'Account type' },
      { key: 'routing_number',   label: 'Routing number' },
      { key: 'online_username',  label: 'Online username / email' },
      { key: 'online_password',  label: 'Online password', sensitive: true },
      { key: 'notes',            label: 'Notes', multiline: true },
    ];
    case 'card':      return [
      { key: 'cardholder_name', label: 'Cardholder name' },
      { key: 'card_number',     label: 'Card number' },
      { key: 'expiration',      label: 'Expiration date' },
      { key: 'cvv',             label: 'CVV', sensitive: true },
      { key: 'pin',             label: 'PIN', sensitive: true },
      { key: 'bank',            label: 'Issuing bank' },
      { key: 'card_type',       label: 'Card type' },
      { key: 'notes',           label: 'Notes', multiline: true },
    ];
    case 'identity':  return [
      { key: 'doc_type',        label: 'Document type' },
      { key: 'doc_number',      label: 'Document number' },
      { key: 'issuing_country', label: 'Issuing country / state' },
      { key: 'issue_date',      label: 'Issue date' },
      { key: 'expiry_date',     label: 'Expiry date' },
      { key: 'notes',           label: 'Notes', multiline: true },
    ];
    case 'crypto':    return [
      { key: 'wallet_name', label: 'Wallet / Exchange' },
      { key: 'seed_phrase', label: 'Seed phrase', multiline: true, sensitive: true },
      { key: 'notes',       label: 'Notes', multiline: true },
    ];
    case 'note':      return [{ key: 'content', label: 'Content', multiline: true }];
    case 'file':      return [{ key: 'description', label: 'Description', multiline: true }];
    default:          return [
      { key: 'category', label: 'Category' },
      { key: 'details',  label: 'Details', multiline: true },
    ];
  }
}

export default function EntryDetailScreen() {
  const { id, entryId } = useLocalSearchParams<{ id: string; entryId: string }>();
  const { entries, ceks, loadEntries } = useVaultStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const entry = (entries[id] ?? []).find((e) => e.id === entryId);
  const cek = id ? ceks[id] : null;

  const [decrypted, setDecrypted] = useState<Record<string, string> | null>(null);
  const [loading, setLoading] = useState(true);
  const [decryptError, setDecryptError] = useState('');

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(entry?.title ?? '');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [deleting, setDeleting] = useState(false);

  const [isFavorite, setIsFavorite] = useState(entry?.is_favorite ?? false);
  const [togglingFav, setTogglingFav] = useState(false);
  const [hiddenFields, setHiddenFields] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!entry || !cek) { setLoading(false); return; }
    decryptObject<Record<string, string>>(entry.encrypted_data, cek)
      .then((d) => {
        setDecrypted(d);
        setTitle(d.title ?? entry.title);
        // pre-populate edit fields
        const fieldDefs = getFieldsForType(entry.entry_type as EntryType);
        const init: Record<string, string> = {};
        for (const f of fieldDefs) init[f.key] = d[f.key] ?? '';
        setFields(init);
        // hide sensitive fields by default
        const hidden = new Set<string>();
        for (const f of fieldDefs) { if (f.sensitive) hidden.add(f.key); }
        setHiddenFields(hidden);
      })
      .catch(() => setDecryptError('Failed to decrypt entry.'))
      .finally(() => setLoading(false));
  }, [entry?.id, cek]);

  const handleToggleFavorite = async () => {
    if (!entry || togglingFav) return;
    setTogglingFav(true);
    const newVal = !isFavorite;
    setIsFavorite(newVal);
    try {
      await api.updateEntry(id, entryId, { is_favorite: newVal });
    } catch {
      setIsFavorite(!newVal);
    } finally {
      setTogglingFav(false);
    }
  };

  const handleSave = async () => {
    if (!cek || !decrypted) return;
    if (!title.trim()) { setSaveError('Name is required.'); return; }
    setSaving(true);
    setSaveError('');
    try {
      const payload = entry!.entry_type === 'file'
        ? { ...decrypted, title: title.trim(), description: fields.description ?? '' }
        : { type: entry!.entry_type, title: title.trim(), ...fields };
      const encrypted_data = await encryptObject(payload, cek);
      await api.updateEntry(id, entryId, { title: title.trim(), encrypted_data });
      await loadEntries(id);
      setDecrypted(payload as Record<string, string>);
      setEditing(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete entry',
      `Delete "${entry?.title}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await api.deleteEntry(id, entryId);
              await loadEntries(id);
              router.back();
            } catch {
              Alert.alert('Error', 'Failed to delete entry.');
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View className="flex-1 bg-background dark:bg-dark-bg items-center justify-center">
        <ActivityIndicator color="#5B7FA6" />
      </View>
    );
  }

  if (!entry) {
    return (
      <View className="flex-1 bg-background dark:bg-dark-bg items-center justify-center px-6">
        <Text className="text-text-secondary dark:text-dark-text-secondary">Entry not found.</Text>
        <TouchableOpacity onPress={() => router.back()} className="mt-4">
          <Text style={{ color: '#5B7FA6', fontSize: 15, fontWeight: '500' }}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const fieldDefs = getFieldsForType(entry.entry_type as EntryType);

  // ── Edit mode ──────────────────────────────────────────────────────────────
  if (editing) {
    return (
      <ScrollView
        className="flex-1 bg-background dark:bg-dark-bg"
        contentContainerStyle={{ padding: 24, paddingTop: insets.top + 16, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ marginBottom: 24 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <TextActionButton onPress={() => { setEditing(false); setSaveError(''); }} label="Cancel" muted />
            {saving
              ? <ActivityIndicator size="small" color="#5B7FA6" />
              : <TextActionButton onPress={handleSave} label="Save" />}
          </View>
          <Text style={{ fontSize: 26, fontWeight: '700', marginTop: 10, textAlign: 'center' }} className="text-text-primary dark:text-dark-text-primary">Edit</Text>
        </View>

        <Text style={{ fontSize: 12, fontWeight: '500' }} className="text-text-secondary dark:text-dark-text-secondary mb-1">Name</Text>
        <TextInput
          className="bg-surface dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-4 text-text-primary dark:text-dark-text-primary mb-4"
          style={{ paddingVertical: 12, fontSize: 16 }}
          value={title}
          onChangeText={setTitle}
          autoCapitalize="words"
        />

        {entry.entry_type !== 'file' && fieldDefs.map((f) => (
          <View key={f.key} className="mb-4">
            <Text style={{ fontSize: 12, fontWeight: '500' }} className="text-text-secondary dark:text-dark-text-secondary mb-1">
              {f.label}
            </Text>
            <TextInput
              className="bg-surface dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-4 text-text-primary dark:text-dark-text-primary"
              style={{ paddingVertical: 12, fontSize: 16, minHeight: f.multiline ? 96 : undefined, textAlignVertical: f.multiline ? 'top' : 'center' }}
              value={fields[f.key] ?? ''}
              onChangeText={(v) => setFields((p) => ({ ...p, [f.key]: v }))}
              multiline={f.multiline}
              secureTextEntry={f.sensitive}
              autoCapitalize="none"
              placeholderTextColor="#9A9490"
            />
          </View>
        ))}

        {entry.entry_type === 'file' && (
          <View className="mb-4">
            <Text style={{ fontSize: 12, fontWeight: '500' }} className="text-text-secondary dark:text-dark-text-secondary mb-1">Description</Text>
            <TextInput
              className="bg-surface dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-4 text-text-primary dark:text-dark-text-primary"
              style={{ paddingVertical: 12, fontSize: 16, minHeight: 80, textAlignVertical: 'top' }}
              value={fields.description ?? ''}
              onChangeText={(v) => setFields((p) => ({ ...p, description: v }))}
              multiline
              placeholderTextColor="#9A9490"
            />
          </View>
        )}

        {saveError ? <Text style={{ fontSize: 13 }} className="text-destructive mb-4">{saveError}</Text> : null}
      </ScrollView>
    );
  }

  // ── View mode ──────────────────────────────────────────────────────────────
  return (
    <ScrollView
      className="flex-1 bg-background dark:bg-dark-bg"
      contentContainerStyle={{ padding: 24, paddingTop: insets.top + 16, paddingBottom: 48 }}
    >
      <View style={{ marginBottom: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <BackButton onPress={() => router.back()} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity onPress={handleToggleFavorite} disabled={togglingFav}>
              <Text style={{ fontSize: 20, color: isFavorite ? '#f59e0b' : '#9A9490' }}>★</Text>
            </TouchableOpacity>
            <TextActionButton onPress={() => setEditing(true)} label="Edit" />
          </View>
        </View>
        <Text style={{ fontSize: 26, fontWeight: '700', marginTop: 10, textAlign: 'center' }} className="text-text-primary dark:text-dark-text-primary" numberOfLines={1}>
          {decrypted?.title ?? entry.title}
        </Text>
      </View>

      {decryptError ? (
        <Text className="text-destructive text-sm">{decryptError}</Text>
      ) : decrypted ? (
        <>
          {fieldDefs.map((f) => {
            const value = decrypted[f.key];
            if (!value) return null;
            const isHidden = hiddenFields.has(f.key);
            return (
              <View key={f.key} className="mb-4">
                <Text style={{ fontSize: 12, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.5 }} className="text-text-secondary dark:text-dark-text-secondary mb-1">
                  {f.label}
                </Text>
                <TouchableOpacity
                  className="bg-surface dark:bg-dark-surface rounded-lg px-4 py-3"
                  onPress={() => {
                    if (f.sensitive) {
                      setHiddenFields((prev) => {
                        const next = new Set(prev);
                        next.has(f.key) ? next.delete(f.key) : next.add(f.key);
                        return next;
                      });
                    }
                  }}
                  activeOpacity={f.sensitive ? 0.7 : 1}
                >
                  <Text style={{ fontSize: 15 }} className="text-text-primary dark:text-dark-text-primary">
                    {f.sensitive && isHidden ? '••••••••' : value}
                  </Text>
                  {f.sensitive && (
                    <Text style={{ fontSize: 11 }} className="text-text-muted dark:text-dark-text-muted mt-1">
                      {isHidden ? 'Tap to reveal' : 'Tap to hide'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            );
          })}

          {/* Fallback: show any fields not in the field def (e.g. unknown types) */}
          {Object.entries(decrypted)
            .filter(([k]) => k !== 'type' && k !== 'title' && !fieldDefs.find((f) => f.key === k))
            .map(([key, value]) => value ? (
              <View key={key} className="mb-4">
                <Text style={{ fontSize: 12, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.5 }} className="text-text-secondary dark:text-dark-text-secondary mb-1">
                  {key.replace(/_/g, ' ')}
                </Text>
                <View className="bg-surface dark:bg-dark-surface rounded-lg px-4 py-3">
                  <Text style={{ fontSize: 15 }} className="text-text-primary dark:text-dark-text-primary">{value}</Text>
                </View>
              </View>
            ) : null)}

          <TouchableOpacity
            className="bg-destructive/10 rounded-xl py-4 items-center mt-4"
            onPress={handleDelete}
            disabled={deleting}
          >
            {deleting
              ? <ActivityIndicator size="small" color="#ef4444" />
              : <Text style={{ fontSize: 15, fontWeight: '600' }} className="text-destructive">Delete entry</Text>}
          </TouchableOpacity>
        </>
      ) : null}
    </ScrollView>
  );
}
