import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/auth';
import { useAppStore } from '@/store/app';

interface SettingsRow {
  label: string;
  description?: string;
  route: string;
}

const ROWS: SettingsRow[] = [
  { label: 'Account', description: 'Name, email, password', route: '/(app)/settings/account' },
  { label: 'Security', description: 'App lock, biometric, MFA, clipboard', route: '/(app)/settings/security' },
  { label: 'Active sessions', description: 'View and revoke login sessions', route: '/(app)/settings/sessions' },
  { label: 'Server', description: 'Change your server URL', route: '/(app)/settings/server' },
];

export default function SettingsScreen() {
  const { user, logout } = useAuthStore();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.replace('/(auth)/login');
  };

  return (
    <ScrollView className="flex-1 bg-background dark:bg-dark-bg" contentContainerStyle={{ padding: 24 }}>
      <Text className="text-2xl font-semibold text-text-primary dark:text-dark-text-primary mb-6">
        Settings
      </Text>

      {user && (
        <View className="bg-surface dark:bg-dark-surface rounded-xl p-4 mb-6">
          <Text className="text-base font-medium text-text-primary dark:text-dark-text-primary">
            {user.display_name}
          </Text>
          <Text className="text-sm text-text-secondary dark:text-dark-text-secondary">
            {user.email}
          </Text>
        </View>
      )}

      <View className="bg-surface dark:bg-dark-surface rounded-xl overflow-hidden mb-6">
        {ROWS.map((row, i) => (
          <TouchableOpacity
            key={row.route}
            className={`px-4 py-4 flex-row items-center justify-between ${i < ROWS.length - 1 ? 'border-b border-border dark:border-dark-border' : ''}`}
            onPress={() => router.push(row.route as Parameters<typeof router.push>[0])}
          >
            <View>
              <Text className="text-base text-text-primary dark:text-dark-text-primary">
                {row.label}
              </Text>
              {row.description && (
                <Text className="text-sm text-text-secondary dark:text-dark-text-secondary">
                  {row.description}
                </Text>
              )}
            </View>
            <Text className="text-text-secondary dark:text-dark-text-secondary">›</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        className="bg-destructive/10 rounded-xl py-4 items-center"
        onPress={handleLogout}
      >
        <Text className="text-destructive font-medium text-base">Sign out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
