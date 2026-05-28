import { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MailCheck, Pencil } from 'lucide-react-native';
import { api } from '@/lib/api';
import { AddButton } from '@/components/nav-buttons';
import type { Beneficiary } from '@/types';

export default function BeneficiariesScreen() {
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const load = useCallback(() => {
    setLoading(true);
    api.listBeneficiaries()
      .then(setBeneficiaries)
      .catch(() => setError('Failed to load beneficiaries.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <View className="flex-1 bg-background dark:bg-dark-bg items-center justify-center">
        <ActivityIndicator color="#5B7FA6" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background dark:bg-dark-bg">
      <View className="px-6 pb-4 relative flex-row items-center justify-center" style={{ paddingTop: insets.top + 16 }}>
        <View className="items-center">
          <Text className="text-2xl font-semibold text-text-primary dark:text-dark-text-primary">
            Beneficiaries
          </Text>
          <Text className="text-sm text-text-secondary dark:text-dark-text-secondary mt-1">
            People who will receive your vaults.
          </Text>
        </View>
        <View className="absolute right-0">
          <AddButton onPress={() => router.push('/(app)/beneficiaries/new')} />
        </View>
      </View>

      {error ? (
        <Text className="text-destructive text-sm px-6">{error}</Text>
      ) : (
        <FlatList
          data={beneficiaries}
          keyExtractor={(b) => b.id}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              className="bg-surface dark:bg-dark-surface rounded-xl px-4 py-3.5 mb-3 flex-row items-center justify-between"
              onPress={() => router.push(`/(app)/beneficiaries/${item.id}`)}
            >
              <View className="flex-1 mr-3">
                <Text style={{ fontSize: 15, fontWeight: '500' }} className="text-text-primary dark:text-dark-text-primary mb-0.5">
                  {item.name}
                </Text>
                <Text style={{ fontSize: 13 }} className="text-text-secondary dark:text-dark-text-secondary">
                  {item.email}
                </Text>
                {item.relationship ? (
                  <Text style={{ fontSize: 12 }} className="text-text-secondary dark:text-dark-text-secondary mt-0.5">
                    {item.relationship}
                  </Text>
                ) : null}
              </View>
              <View className="flex-row items-center gap-3">
                <View className="flex-row items-center gap-1 px-2 py-1 rounded-full bg-surface-muted dark:bg-dark-surface-muted">
                  <MailCheck size={11} color="#9A9490" />
                  <Text style={{ fontSize: 11, fontWeight: '500' }} className="text-text-muted dark:text-dark-text-muted">
                    Invited
                  </Text>
                </View>
                <Pencil size={15} color="#9A9490" />
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View className="items-center mt-12">
              <Text className="text-text-secondary dark:text-dark-text-secondary text-base">
                No beneficiaries yet.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}
