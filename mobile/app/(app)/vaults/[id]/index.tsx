import { useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useVaultStore } from '@/store/vault';
import { decryptObject } from '@/lib/crypto';
import type { EntryType } from '@/types';

const ENTRY_TYPE_LABELS: Record<EntryType, string> = {
  login: 'Login',
  note: 'Secure Note',
  file: 'File',
  contact: 'Contact',
  financial: 'Financial Account',
  card: 'Card',
  identity: 'Identity Document',
  crypto: 'Crypto Wallet',
  custom: 'Custom',
};

export default function VaultDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { vaults, entries, ceks, loadEntries, isLoading } = useVaultStore();
  const router = useRouter();

  const vault = vaults.find((v) => v.id === id);
  const vaultEntries = entries[id] ?? [];
  const cek = id ? ceks[id] : null;

  useEffect(() => {
    if (id) loadEntries(id);
  }, [id]);

  if (!vault) {
    return (
      <View className="flex-1 bg-background dark:bg-dark-bg items-center justify-center">
        <Text className="text-text-secondary dark:text-dark-text-secondary">Vault not found.</Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View className="flex-1 bg-background dark:bg-dark-bg items-center justify-center">
        <ActivityIndicator color="#5B7FA6" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background dark:bg-dark-bg">
      <View className="px-6 pt-12 pb-4 flex-row items-center">
        <TouchableOpacity onPress={() => router.back()} className="mr-3 py-1">
          <Text className="text-primary text-base">← Back</Text>
        </TouchableOpacity>
        <Text className="text-xl font-semibold text-text-primary dark:text-dark-text-primary flex-1">
          {vault.icon} {vault.name}
        </Text>
        <TouchableOpacity onPress={() => router.push(`/(app)/vaults/${id}/entry/new`)}>
          <Text className="text-primary font-medium">+ Add</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={vaultEntries}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            className={`bg-surface dark:bg-dark-surface rounded-xl p-4 mb-3 flex-row items-center ${item.is_favorite ? 'border border-accent' : ''}`}
            onPress={() => router.push(`/(app)/vaults/${id}/entry/${item.id}`)}
          >
            <View className="flex-1">
              <Text className="text-base font-medium text-text-primary dark:text-dark-text-primary">
                {item.title}
              </Text>
              <Text className="text-sm text-text-secondary dark:text-dark-text-secondary">
                {ENTRY_TYPE_LABELS[item.entry_type]}
              </Text>
            </View>
            {item.is_favorite && (
              <Text className="text-accent text-base">★</Text>
            )}
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View className="items-center mt-12">
            <Text className="text-text-secondary dark:text-dark-text-secondary text-base">
              No entries yet.
            </Text>
          </View>
        }
      />
    </View>
  );
}
