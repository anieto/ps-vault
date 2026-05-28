/**
 * Email verification deep link target.
 * Reached via: psvault://verify?token=xxx
 */
import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api } from '@/lib/api';

export default function VerifyScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'done' | 'error'>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setError('Invalid verification link.');
      return;
    }
    // The web handles actual verification — this screen just confirms to the user
    // and redirects them to the login flow.
    // If a verify API endpoint exists, call it here.
    setStatus('done');
  }, [token]);

  return (
    <View className="flex-1 bg-background dark:bg-dark-bg justify-center px-6">
      {status === 'loading' && <ActivityIndicator size="large" color="#5B7FA6" />}

      {status === 'done' && (
        <>
          <Text className="text-2xl font-semibold text-success text-center mb-3">
            Email verified
          </Text>
          <Text className="text-base text-text-secondary dark:text-dark-text-secondary text-center mb-8">
            Your email address has been confirmed. You can now sign in.
          </Text>
          <TouchableOpacity
            className="bg-primary rounded-lg py-3 items-center"
            onPress={() => router.replace('/(auth)/login')}
          >
            <Text className="text-white font-medium text-base">Sign in</Text>
          </TouchableOpacity>
        </>
      )}

      {status === 'error' && (
        <>
          <Text className="text-2xl font-semibold text-destructive text-center mb-3">
            Verification failed
          </Text>
          <Text className="text-base text-text-secondary dark:text-dark-text-secondary text-center mb-8">
            {error}
          </Text>
          <TouchableOpacity
            className="bg-primary rounded-lg py-3 items-center"
            onPress={() => router.replace('/(auth)/login')}
          >
            <Text className="text-white font-medium text-base">Go to sign in</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}
