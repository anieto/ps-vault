import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { BackButton, TextActionButton } from '@/components/nav-buttons';
import { useVaultStore } from '@/store/vault';
import { encryptObject, generateFileKey, encryptBytes, wrapFileKey } from '@/lib/crypto';
import { api } from '@/lib/api';
import type { EntryType } from '@/types';

// ── Entry types ────────────────────────────────────────────────────────────────

const ENTRY_TYPES: { value: EntryType; label: string; icon: string; hint: string }[] = [
  { value: 'contact',   label: 'Contact',      icon: '👤', hint: 'e.g. Dr. Sarah Johnson, John at State Farm' },
  { value: 'login',     label: 'Login',        icon: '🔑', hint: 'e.g. Netflix, Gmail, Amazon' },
  { value: 'financial', label: 'Financial',    icon: '🏦', hint: 'e.g. Chase Checking, Fidelity 401k' },
  { value: 'card',      label: 'Card',         icon: '💳', hint: 'e.g. Visa ending in 4242' },
  { value: 'identity',  label: 'ID / Passport',icon: '🪪', hint: "e.g. US Passport, Driver's License" },
  { value: 'crypto',    label: 'Crypto',       icon: '🪙', hint: 'e.g. Coinbase, Ledger wallet' },
  { value: 'file',      label: 'Document',     icon: '📎', hint: 'e.g. Life insurance policy' },
  { value: 'note',      label: 'Note',         icon: '📝', hint: 'e.g. Instructions for my executor' },
  { value: 'custom',    label: 'Custom',       icon: '⚙️', hint: 'e.g. Gym membership, Storage unit' },
];

// ── Field definitions ──────────────────────────────────────────────────────────

interface FieldDef {
  key: string;
  label: string;
  placeholder: string;
  multiline?: boolean;
  sensitive?: boolean;
}

function getFieldsForType(type: EntryType): FieldDef[] {
  switch (type) {
    case 'contact': return [
      { key: 'relationship', label: 'Relationship / Role',    placeholder: 'e.g. Family doctor, Attorney, Work manager' },
      { key: 'phone',        label: 'Phone number',           placeholder: 'e.g. (555) 123-4567' },
      { key: 'email',        label: 'Email',                  placeholder: 'e.g. sarah@example.com' },
      { key: 'address',      label: 'Address',                placeholder: 'e.g. 123 Main St, City, State' },
      { key: 'notes',        label: 'Notes',                  placeholder: 'Any additional context...', multiline: true },
    ];
    case 'login': return [
      { key: 'username', label: 'Username / Email', placeholder: 'user@example.com' },
      { key: 'password', label: 'Password',         placeholder: '••••••••', sensitive: true },
      { key: 'url',      label: 'Website URL',      placeholder: 'example.com or http://192.168.1.1' },
      { key: 'notes',    label: 'Notes',            placeholder: 'Any additional info...', multiline: true },
    ];
    case 'financial': return [
      { key: 'institution',     label: 'Institution',              placeholder: 'e.g. Chase Bank' },
      { key: 'account_number',  label: 'Account number',           placeholder: '****1234' },
      { key: 'account_type',    label: 'Account type',             placeholder: 'e.g. Checking, Savings, Brokerage' },
      { key: 'routing_number',  label: 'Routing number',           placeholder: 'e.g. 021000021' },
      { key: 'online_username', label: 'Online username / email',  placeholder: 'user@example.com' },
      { key: 'online_password', label: 'Online password',          placeholder: '••••••••', sensitive: true },
      { key: 'notes',           label: 'Notes',                    placeholder: 'Access instructions, contact info...', multiline: true },
    ];
    case 'card': return [
      { key: 'cardholder_name', label: 'Cardholder name',  placeholder: 'Jane Smith' },
      { key: 'card_number',     label: 'Card number',      placeholder: '1234 5678 9012 3456' },
      { key: 'expiration',      label: 'Expiration date',  placeholder: 'MM/YY' },
      { key: 'cvv',             label: 'CVV',              placeholder: '123', sensitive: true },
      { key: 'pin',             label: 'PIN',              placeholder: '••••', sensitive: true },
      { key: 'bank',            label: 'Issuing bank',     placeholder: 'e.g. Chase, Amex, Capital One' },
      { key: 'card_type',       label: 'Card type',        placeholder: 'e.g. Visa, Mastercard, Amex' },
      { key: 'notes',           label: 'Notes',            placeholder: 'Any additional info...', multiline: true },
    ];
    case 'identity': return [
      { key: 'doc_type',        label: 'Document type',         placeholder: "e.g. Passport, Driver's License, National ID" },
      { key: 'doc_number',      label: 'Document number',       placeholder: 'e.g. A12345678' },
      { key: 'issuing_country', label: 'Issuing country / state', placeholder: 'e.g. United States, California' },
      { key: 'issue_date',      label: 'Issue date',            placeholder: 'e.g. 2020-03-15' },
      { key: 'expiry_date',     label: 'Expiry date',           placeholder: 'e.g. 2030-03-14' },
      { key: 'notes',           label: 'Notes',                 placeholder: 'Storage location, renewal reminders, etc.', multiline: true },
    ];
    case 'crypto': return [
      { key: 'wallet_name', label: 'Wallet / Exchange', placeholder: 'e.g. Coinbase, hardware wallet' },
      { key: 'seed_phrase', label: 'Seed phrase',       placeholder: '12 or 24 word seed phrase...', multiline: true, sensitive: true },
      { key: 'notes',       label: 'Notes',             placeholder: 'Access instructions...', multiline: true },
    ];
    case 'note': return [
      { key: 'content', label: 'Content', placeholder: 'Write your note here...', multiline: true },
    ];
    case 'file': return []; // handled separately
    default: return [
      { key: 'category', label: 'Category', placeholder: 'e.g. Insurance, Membership, Legal, Medical...' },
      { key: 'details',  label: 'Details',  placeholder: 'Enter any information you want to pass on...', multiline: true },
    ];
  }
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function NewEntryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { ceks, loadEntries } = useVaultStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cek = id ? ceks[id] : null;

  const [type, setType] = useState<EntryType>('contact');
  const [title, setTitle] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pickedFile, setPickedFile] = useState<{ name: string; uri: string; size: number; mimeType: string } | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fieldDefs = getFieldsForType(type);
  const titleHint = ENTRY_TYPES.find((t) => t.value === type)?.hint ?? '';

  const handleTypeChange = (newType: EntryType) => {
    setType(newType);
    setFields({});
    setPickedFile(null);
    setError('');
  };

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        setPickedFile({
          name: asset.name,
          uri: asset.uri,
          size: asset.size ?? 0,
          mimeType: asset.mimeType ?? 'application/octet-stream',
        });
      }
    } catch {
      Alert.alert('Error', 'Failed to pick file.');
    }
  };

  const handleSave = async () => {
    if (!cek) { setError('Vault key unavailable. Please lock and unlock the app.'); return; }
    if (!title.trim()) { setError('Name is required.'); return; }
    if (type === 'file' && !pickedFile) { setError('Please select a file to attach.'); return; }

    setSaving(true);
    setError('');
    setUploadProgress(0);

    try {
      let payload: Record<string, string>;

      if (type === 'file' && pickedFile) {
        // Read file bytes
        const resp = await fetch(pickedFile.uri);
        const buffer = await resp.arrayBuffer();
        const fileBytes = new Uint8Array(buffer);

        // Encrypt file content
        const fileKey = await generateFileKey();
        const encryptedPayload = await encryptBytes(fileBytes, fileKey);
        const blob = new Blob([encryptedPayload], { type: 'application/octet-stream' });

        // Upload to server
        const vaultFile = await api.uploadFile(id, blob, setUploadProgress);
        const wrappedFileKey = await wrapFileKey(fileKey, cek);

        payload = {
          type,
          title: title.trim(),
          description: fields.description ?? '',
          original_name: pickedFile.name,
          size_bytes: String(pickedFile.size),
          storage_token: vaultFile.storage_token,
          wrapped_file_key: wrappedFileKey,
        };
      } else {
        payload = { type, title: title.trim(), ...fields };
      }

      const encrypted_data = await encryptObject(payload, cek);
      await api.createEntry(id, { entry_type: type, title: title.trim(), encrypted_data });
      await loadEntries(id);
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save entry.');
    } finally {
      setSaving(false);
      setUploadProgress(0);
    }
  };

  return (
    <ScrollView
      className="flex-1 bg-background dark:bg-dark-bg"
      contentContainerStyle={{ padding: 24, paddingTop: insets.top + 16, paddingBottom: 48 }}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <View style={{ marginBottom: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <BackButton onPress={() => router.back()} />
          {saving
            ? <ActivityIndicator size="small" color="#5B7FA6" />
            : <TextActionButton onPress={handleSave} label="Save entry" />}
        </View>
        <Text style={{ fontSize: 26, fontWeight: '700', marginTop: 10, textAlign: 'center' }} className="text-text-primary dark:text-dark-text-primary">
          New Entry
        </Text>
      </View>

      {/* Type picker */}
      <Text style={{ fontSize: 12, fontWeight: '600', letterSpacing: 0.6 }} className="text-text-secondary dark:text-dark-text-secondary uppercase mb-2">
        Type
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
        {ENTRY_TYPES.map((t) => {
          const active = type === t.value;
          return (
            <TouchableOpacity
              key={t.value}
              onPress={() => handleTypeChange(t.value)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 5,
                paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
                backgroundColor: active ? '#5B7FA6' : 'transparent',
                borderWidth: 1,
                borderColor: active ? '#5B7FA6' : '#D4CFC9',
              }}
            >
              <Text style={{ fontSize: 13 }}>{t.icon}</Text>
              <Text style={{ fontSize: 13, fontWeight: '500', color: active ? '#fff' : '#6B6560' }}>
                {t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Name */}
      <Text style={{ fontSize: 12, fontWeight: '500' }} className="text-text-secondary dark:text-dark-text-secondary mb-1">
        Name <Text className="text-destructive">*</Text>
      </Text>
      <TextInput
        className="bg-surface dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-4 text-text-primary dark:text-dark-text-primary mb-4"
        style={{ paddingVertical: 12, fontSize: 15 }}
        placeholder={titleHint}
        placeholderTextColor="#9A9490"
        value={title}
        onChangeText={setTitle}
        autoCapitalize="words"
        returnKeyType="next"
      />

      {/* Type-specific fields */}
      {type === 'file' ? (
        <FileSection
          pickedFile={pickedFile}
          onPickFile={handlePickFile}
          description={fields.description ?? ''}
          onDescriptionChange={(v) => setFields((p) => ({ ...p, description: v }))}
          uploadProgress={saving ? uploadProgress : null}
        />
      ) : (
        fieldDefs.map((f) => (
          <View key={f.key} className="mb-4">
            <Text style={{ fontSize: 12, fontWeight: '500' }} className="text-text-secondary dark:text-dark-text-secondary mb-1">
              {f.label}
            </Text>
            <TextInput
              className="bg-surface dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-4 text-text-primary dark:text-dark-text-primary"
              style={{
                paddingVertical: 12,
                fontSize: 15,
                minHeight: f.multiline ? 90 : undefined,
                textAlignVertical: f.multiline ? 'top' : 'center',
              }}
              placeholder={f.placeholder}
              placeholderTextColor="#9A9490"
              value={fields[f.key] ?? ''}
              onChangeText={(v) => setFields((p) => ({ ...p, [f.key]: v }))}
              multiline={f.multiline}
              secureTextEntry={f.sensitive && !f.multiline}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        ))
      )}

      {error ? (
        <Text style={{ fontSize: 13 }} className="text-destructive mb-4">{error}</Text>
      ) : null}

      {/* Save button */}
      <TouchableOpacity
        className="bg-primary rounded-xl py-4 items-center mt-2"
        onPress={handleSave}
        disabled={saving}
        style={{ opacity: saving ? 0.6 : 1 }}
      >
        {saving ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ActivityIndicator size="small" color="#fff" />
            <Text style={{ fontSize: 15, fontWeight: '600', color: '#fff' }}>
              {type === 'file' && uploadProgress > 0 ? `Uploading ${uploadProgress}%…` : 'Saving…'}
            </Text>
          </View>
        ) : (
          <Text style={{ fontSize: 15, fontWeight: '600', color: '#fff' }}>Save entry</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── File section ───────────────────────────────────────────────────────────────

function FileSection({
  pickedFile,
  onPickFile,
  description,
  onDescriptionChange,
  uploadProgress,
}: {
  pickedFile: { name: string; size: number } | null;
  onPickFile: () => void;
  description: string;
  onDescriptionChange: (v: string) => void;
  uploadProgress: number | null;
}) {
  return (
    <View className="mb-4">
      {/* File picker */}
      <Text style={{ fontSize: 12, fontWeight: '500' }} className="text-text-secondary dark:text-dark-text-secondary mb-1">
        File <Text className="text-destructive">*</Text>
      </Text>
      <TouchableOpacity
        onPress={onPickFile}
        className="bg-surface dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-4 py-4 items-center justify-center mb-3"
        style={{ borderStyle: 'dashed' }}
      >
        {pickedFile ? (
          <View style={{ alignItems: 'center', gap: 4 }}>
            <Text style={{ fontSize: 24 }}>📄</Text>
            <Text style={{ fontSize: 14, fontWeight: '500' }} className="text-text-primary dark:text-dark-text-primary text-center">
              {pickedFile.name}
            </Text>
            <Text style={{ fontSize: 12 }} className="text-text-secondary dark:text-dark-text-secondary">
              {pickedFile.size > 0 ? `${(pickedFile.size / 1024).toFixed(1)} KB` : ''} · Tap to change
            </Text>
          </View>
        ) : (
          <View style={{ alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 28 }}>📎</Text>
            <Text style={{ fontSize: 14, fontWeight: '500' }} className="text-primary">
              Choose a file
            </Text>
            <Text style={{ fontSize: 12 }} className="text-text-muted dark:text-dark-text-muted">
              Encrypted before upload — the server never sees the contents
            </Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Upload progress */}
      {uploadProgress !== null && (
        <View className="mb-3">
          <View className="bg-border dark:bg-dark-border rounded-full overflow-hidden" style={{ height: 4 }}>
            <View className="bg-primary rounded-full" style={{ height: 4, width: `${uploadProgress}%` }} />
          </View>
          <Text style={{ fontSize: 11, marginTop: 4 }} className="text-text-secondary dark:text-dark-text-secondary text-center">
            Uploading {uploadProgress}%
          </Text>
        </View>
      )}

      {/* Description */}
      <Text style={{ fontSize: 12, fontWeight: '500' }} className="text-text-secondary dark:text-dark-text-secondary mb-1">
        Description
      </Text>
      <TextInput
        className="bg-surface dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-4 text-text-primary dark:text-dark-text-primary"
        style={{ paddingVertical: 12, fontSize: 15, minHeight: 80, textAlignVertical: 'top' }}
        placeholder="What is this document? Where is the original stored?"
        placeholderTextColor="#9A9490"
        value={description}
        onChangeText={onDescriptionChange}
        multiline
      />
    </View>
  );
}
