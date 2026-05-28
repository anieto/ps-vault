import { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { api } from '@/lib/api';
import type { Beneficiary } from '@/types';

export default function BeneficiariesScreen() {
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.listBeneficiaries()
      .then(setBeneficiaries)
      .catch(() => setError('Failed to load beneficiaries.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <View className="flex-1 bg-background dark:bg-dark-bg items-center justify-center">
        <ActivityIndicator color="#5B7FA6" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background dark:bg-dark-bg">
      <View className="px-6 pt-12 pb-4">
        <Text className="text-2xl font-semibold text-text-primary dark:text-dark-text-primary">
          Beneficiaries
        </Text>
        <Text className="text-sm text-text-secondary dark:text-dark-text-secondary mt-1">
          People who will receive your vaults.
        </Text>
      </View>

      {error ? (
        <Text className="text-destructive text-sm px-6">{error}</Text>
      ) : (
        <FlatList
          data={beneficiaries}
          keyExtractor={(b) => b.id}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => (
            <View className="bg-surface dark:bg-dark-surface rounded-xl p-4 mb-3">
              <View className="flex-row items-center justify-between mb-1">
                <Text className="text-base font-medium text-text-primary dark:text-dark-text-primary">
                  {item.name}
                </Text>
                {!item.email_confirmed && (
                  <View className="bg-warning/20 rounded px-2 py-0.5">
                    <Text className="text-warning text-xs font-medium">Unconfirmed</Text>
                  </View>
                )}
              </View>
              <Text className="text-sm text-text-secondary dark:text-dark-text-secondary">
                {item.email}
              </Text>
              {item.relationship ? (
                <Text className="text-xs text-text-secondary dark:text-dark-text-secondary mt-1">
                  {item.relationship}
                </Text>
              ) : null}
            </View>
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
