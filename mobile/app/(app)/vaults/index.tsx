import { useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useVaultStore } from '@/store/vault';
import { useAuthStore } from '@/store/auth';

export default function VaultsScreen() {
  const { vaults, isLoading, loadVaults } = useVaultStore();
  const { mek } = useAuthStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (mek) loadVaults(mek);
  }, [mek]);

  if (isLoading) {
    return (
      <View className="flex-1 bg-background dark:bg-dark-bg items-center justify-center">
        <ActivityIndicator color="#5B7FA6" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background dark:bg-dark-bg">
      <View className="px-6 pb-4 items-center" style={{ paddingTop: insets.top + 16 }}>
        <Text className="text-2xl font-semibold text-text-primary dark:text-dark-text-primary">
          Vaults
        </Text>
      </View>

      <FlatList
        data={vaults}
        keyExtractor={(v) => v.id}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            className="bg-surface dark:bg-dark-surface rounded-xl p-4 mb-3 flex-row items-center"
            onPress={() => router.push(`/(app)/vaults/${item.id}`)}
          >
            <Text className="text-2xl mr-3">{item.icon || '🔒'}</Text>
            <View className="flex-1">
              <Text className="text-base font-medium text-text-primary dark:text-dark-text-primary">
                {item.name}
              </Text>
              {item.description ? (
                <Text className="text-sm text-text-secondary dark:text-dark-text-secondary" numberOfLines={1}>
                  {item.description}
                </Text>
              ) : null}
            </View>
            <Text className="text-text-secondary dark:text-dark-text-secondary text-base">›</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View className="items-center mt-12">
            <Text className="text-text-secondary dark:text-dark-text-secondary text-base">
              No vaults yet.
            </Text>
          </View>
        }
      />
    </View>
  );
}
