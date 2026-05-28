import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAppStore } from '@/store/app';

export default function ServerSettingsScreen() {
  const { serverUrl, setServerUrl } = useAppStore();
  const [url, setUrl] = useState(serverUrl ?? '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleSave = async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      setError('Please enter a URL.');
      return;
    }
    if (!/^https?:\/\/.+/.test(trimmed)) {
      setError('URL must start with https:// or http://');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await setServerUrl(trimmed);
      setSaved(true);
      setTimeout(() => router.back(), 1000);
    } catch {
      setError('Failed to save. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background dark:bg-dark-bg"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View className="flex-1 px-6" style={{ paddingTop: insets.top + 16 }}>
        <View className="relative flex-row items-center justify-center mb-6">
          <TouchableOpacity onPress={() => router.back()} className="absolute left-0">
            <Text className="text-primary text-base">← Back</Text>
          </TouchableOpacity>
          <Text className="text-xl font-semibold text-text-primary dark:text-dark-text-primary">
            Server
          </Text>
        </View>

        <Text className="text-sm text-text-secondary dark:text-dark-text-secondary mb-4">
          Changing the server URL will sign you out. Make sure you have access to the new instance.
        </Text>

        <Text className="text-sm font-medium text-text-primary dark:text-dark-text-primary mb-1">
          Server URL
        </Text>
        <TextInput
          className="bg-surface dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-4 text-text-primary dark:text-dark-text-primary mb-1"
          style={{ paddingVertical: 14, fontSize: 16 }}
          placeholder="https://vault.yourdomain.com"
          placeholderTextColor="#9A9490"
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        {error ? (
          <Text className="text-destructive text-sm mb-4">{error}</Text>
        ) : saved ? (
          <Text className="text-success text-sm mb-4">Saved.</Text>
        ) : (
          <View className="mb-4" />
        )}

        <TouchableOpacity
          className="bg-primary rounded-lg py-3 items-center"
          onPress={handleSave}
          disabled={loading}
        >
          <Text className="text-white font-medium text-base">
            {loading ? 'Saving…' : 'Save'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
