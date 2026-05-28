import { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { api } from '@/lib/api';

interface Session {
  id: string;
  device_info: string;
  ip_address: string;
  last_used_at: string;
}

export default function SessionsScreen() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const load = () => {
    api.getSessions()
      .then(setSessions)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const revokeSession = (id: string) => {
    Alert.alert('Revoke session', 'This will sign out that device.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Revoke',
        style: 'destructive',
        onPress: async () => {
          await api.revokeSession(id);
          load();
        },
      },
    ]);
  };

  const revokeAll = () => {
    Alert.alert('Revoke all sessions', 'This will sign you out on all devices.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Revoke all',
        style: 'destructive',
        onPress: async () => {
          await api.revokeAllSessions();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  return (
    <View className="flex-1 bg-background dark:bg-dark-bg">
      <View className="px-6 pt-12 pb-4 flex-row items-center justify-between">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="mr-3">
            <Text className="text-primary text-base">← Back</Text>
          </TouchableOpacity>
          <Text className="text-xl font-semibold text-text-primary dark:text-dark-text-primary">
            Active sessions
          </Text>
        </View>
        <TouchableOpacity onPress={revokeAll}>
          <Text className="text-destructive text-sm font-medium">Revoke all</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color="#5B7FA6" className="mt-12" />
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => (
            <View className="bg-surface dark:bg-dark-surface rounded-xl p-4 mb-3 flex-row items-center">
              <View className="flex-1">
                <Text className="text-base font-medium text-text-primary dark:text-dark-text-primary">
                  {item.device_info || 'Unknown device'}
                </Text>
                <Text className="text-sm text-text-secondary dark:text-dark-text-secondary">
                  {item.ip_address}
                </Text>
                <Text className="text-xs text-text-secondary dark:text-dark-text-secondary">
                  Last active: {new Date(item.last_used_at).toLocaleDateString()}
                </Text>
              </View>
              <TouchableOpacity onPress={() => revokeSession(item.id)} className="ml-3">
                <Text className="text-destructive text-sm">Revoke</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </View>
  );
}
