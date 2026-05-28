/**
 * New entry screen — stub.
 * Full implementation: entry type picker → type-specific form → encrypt → save.
 */
import { View, Text, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BackButton } from '@/components/nav-buttons';

export default function NewEntryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-background dark:bg-dark-bg px-6" style={{ paddingTop: insets.top + 16 }}>
      <View className="relative flex-row items-center justify-center mb-8">
        <BackButton onPress={() => router.back()} />
        <Text className="text-xl font-semibold text-text-primary dark:text-dark-text-primary">
          New Entry
        </Text>
      </View>
      <Text className="text-text-secondary dark:text-dark-text-secondary text-base">
        Entry creation coming soon.
      </Text>
    </View>
  );
}
