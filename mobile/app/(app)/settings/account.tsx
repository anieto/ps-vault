/**
 * Account settings — display name, email change, password change.
 * Stub: shows user info; full forms come in implementation.
 */
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/auth';

export default function AccountSettingsScreen() {
  const { user } = useAuthStore();
  const router = useRouter();

  return (
    <ScrollView className="flex-1 bg-background dark:bg-dark-bg" contentContainerStyle={{ padding: 24 }}>
      <View className="flex-row items-center mb-6">
        <TouchableOpacity onPress={() => router.back()} className="mr-3">
          <Text className="text-primary text-base">← Back</Text>
        </TouchableOpacity>
        <Text className="text-xl font-semibold text-text-primary dark:text-dark-text-primary">
          Account
        </Text>
      </View>

      <View className="bg-surface dark:bg-dark-surface rounded-xl p-4 mb-6">
        <Text className="text-sm text-text-secondary dark:text-dark-text-secondary mb-1">Display name</Text>
        <Text className="text-base text-text-primary dark:text-dark-text-primary mb-4">{user?.display_name}</Text>
        <Text className="text-sm text-text-secondary dark:text-dark-text-secondary mb-1">Email</Text>
        <Text className="text-base text-text-primary dark:text-dark-text-primary">{user?.email}</Text>
      </View>

      <View className="bg-surface dark:bg-dark-surface rounded-xl overflow-hidden">
        {[
          { label: 'Change display name' },
          { label: 'Change email' },
          { label: 'Change password' },
        ].map((item, i, arr) => (
          <TouchableOpacity
            key={item.label}
            className={`px-4 py-4 flex-row items-center justify-between ${i < arr.length - 1 ? 'border-b border-border dark:border-dark-border' : ''}`}
          >
            <Text className="text-base text-text-primary dark:text-dark-text-primary">
              {item.label}
            </Text>
            <Text className="text-text-secondary dark:text-dark-text-secondary">›</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}
