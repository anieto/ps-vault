/**
 * Entry detail screen — decrypts and displays a single vault entry.
 * Stub: renders decrypted JSON for now; full field-by-field UI comes in implementation.
 */
import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useVaultStore } from '@/store/vault';
import { decryptObject } from '@/lib/crypto';

export default function EntryDetailScreen() {
  const { id, entryId } = useLocalSearchParams<{ id: string; entryId: string }>();
  const { entries, ceks } = useVaultStore();
  const router = useRouter();
  const [decrypted, setDecrypted] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const entry = (entries[id] ?? []).find((e) => e.id === entryId);
  const cek = id ? ceks[id] : null;

  useEffect(() => {
    if (!entry || !cek) {
      setLoading(false);
      return;
    }
    decryptObject<Record<string, unknown>>(entry.encrypted_data, cek)
      .then(setDecrypted)
      .catch(() => setError('Failed to decrypt entry.'))
      .finally(() => setLoading(false));
  }, [entry, cek]);

  if (loading) {
    return (
      <View className="flex-1 bg-background dark:bg-dark-bg items-center justify-center">
        <ActivityIndicator color="#5B7FA6" />
      </View>
    );
  }

  if (!entry) {
    return (
      <View className="flex-1 bg-background dark:bg-dark-bg items-center justify-center">
        <Text className="text-text-secondary dark:text-dark-text-secondary">Entry not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-background dark:bg-dark-bg" contentContainerStyle={{ padding: 24 }}>
      <View className="flex-row items-center mb-6">
        <TouchableOpacity onPress={() => router.back()} className="mr-3">
          <Text className="text-primary text-base">← Back</Text>
        </TouchableOpacity>
        <Text className="text-xl font-semibold text-text-primary dark:text-dark-text-primary flex-1">
          {entry.title}
        </Text>
      </View>

      {error ? (
        <Text className="text-destructive text-sm">{error}</Text>
      ) : decrypted ? (
        Object.entries(decrypted).map(([key, value]) => (
          <View key={key} className="mb-4">
            <Text className="text-xs font-medium text-text-secondary dark:text-dark-text-secondary uppercase mb-1">
              {key.replace(/_/g, ' ')}
            </Text>
            <View className="bg-surface dark:bg-dark-surface rounded-lg px-4 py-3">
              <Text className="text-base text-text-primary dark:text-dark-text-primary">
                {typeof value === 'string' ? value : JSON.stringify(value)}
              </Text>
            </View>
          </View>
        ))
      ) : null}
    </ScrollView>
  );
}
