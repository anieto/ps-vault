/**
 * Admin tab — Phase 5 placeholder.
 * Full admin panel ships in Phase 6.
 * This tab is only visible to users with role === "admin" (see (app)/_layout.tsx).
 */
import { View, Text, TouchableOpacity } from 'react-native';
import { useAppStore } from '@/store/app';

export default function AdminScreen() {
  const { serverUrl } = useAppStore();

  return (
    <View className="flex-1 bg-background dark:bg-dark-bg justify-center items-center px-8">
      <Text className="text-2xl font-semibold text-text-primary dark:text-dark-text-primary mb-3 text-center">
        Admin panel
      </Text>
      <Text className="text-base text-text-secondary dark:text-dark-text-secondary text-center mb-6">
        Admin features are available on the web app.
      </Text>
      {serverUrl && (
        <View className="bg-surface dark:bg-dark-surface rounded-xl px-4 py-3">
          <Text className="text-sm font-medium text-text-secondary dark:text-dark-text-secondary mb-1 text-center">
            Your server
          </Text>
          <Text className="text-base text-text-primary dark:text-dark-text-primary text-center font-mono">
            {serverUrl}
          </Text>
        </View>
      )}
    </View>
  );
}
