import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useAppStore } from '@/store/app';

export default function SetupScreen() {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setServerUrl } = useAppStore();
  const router = useRouter();

  const handleContinue = async () => {
    const trimmed = url.trim().replace(/\/$/, '');
    if (!trimmed) {
      setError('Please enter your server URL.');
      return;
    }
    if (!/^https?:\/\/.+/.test(trimmed)) {
      setError('URL must start with https:// or http://');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${trimmed}/health`, { method: 'GET' });
      if (!res.ok) {
        setError('Server responded but returned an error. Check the URL.');
        return;
      }
      await setServerUrl(trimmed);
      router.replace('/(auth)/login');
    } catch {
      setError('Could not connect to that server. Check the URL and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background dark:bg-dark-bg"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View className="flex-1 justify-center px-6">
        <Text className="text-3xl font-semibold text-text-primary dark:text-dark-text-primary mb-2">
          P.S. Vault
        </Text>
        <Text className="text-base text-text-secondary dark:text-dark-text-secondary mb-8">
          Enter your self-hosted server URL to get started.
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
          returnKeyType="done"
          onSubmitEditing={handleContinue}
        />
        {error ? (
          <Text className="text-destructive text-sm mb-4">{error}</Text>
        ) : (
          <View className="mb-4" />
        )}

        <TouchableOpacity
          className="bg-primary rounded-lg py-3 items-center"
          onPress={handleContinue}
          disabled={loading}
        >
          <Text className="text-white font-medium text-base">
            {loading ? 'Connecting…' : 'Connect'}
          </Text>
        </TouchableOpacity>

        <Text className="text-xs text-text-secondary dark:text-dark-text-secondary text-center mt-8">
          P.S. Vault is self-hosted. This app connects to your own server.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}
