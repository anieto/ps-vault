/**
 * New entry screen — stub.
 * Full implementation: entry type picker → type-specific form → encrypt → save.
 */
import { View, Text, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

export default function NewEntryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  return (
    <View className="flex-1 bg-background dark:bg-dark-bg px-6 pt-12">
      <View className="flex-row items-center mb-8">
        <TouchableOpacity onPress={() => router.back()} className="mr-3">
          <Text className="text-primary text-base">← Back</Text>
        </TouchableOpacity>
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
