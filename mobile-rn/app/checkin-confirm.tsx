/**
 * Check-in confirmation screen.
 * Reached via:
 *   - Push notification tap (deep_link: "/checkin-confirm")
 *   - psvault://checkin-confirm?token=xxx (email deep link)
 *
 * The token param is used for email-link check-ins. Push notification
 * check-ins authenticate via the app's existing session and call
 * POST /switch/checkin directly — the token is not required for those.
 */
import { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuthStore } from '@/store/auth';
import { api } from '@/lib/api';

export default function CheckinConfirmScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { isAuthenticated } = useAuthStore();
  const router = useRouter();
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleCheckIn = async () => {
    setStatus('loading');
    try {
      await api.checkIn();
      setStatus('done');
      setMessage("You're all set. Your check-in timer has been reset.");
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Check-in failed. Please try again.');
    }
  };

  const handleDone = () => {
    router.replace('/(app)');
  };

  if (!isAuthenticated) {
    // Redirect unauthenticated deep links to login first
    router.replace('/(auth)/login');
    return null;
  }

  return (
    <View className="flex-1 bg-background dark:bg-dark-bg justify-center px-6">
      {status === 'idle' && (
        <>
          <Text className="text-2xl font-semibold text-text-primary dark:text-dark-text-primary mb-3 text-center">
            Are you okay?
          </Text>
          <Text className="text-base text-text-secondary dark:text-dark-text-secondary text-center mb-8">
            Tap the button below to reset your check-in timer.
          </Text>
          <TouchableOpacity
            className="bg-primary rounded-lg py-4 items-center"
            onPress={handleCheckIn}
          >
            <Text className="text-white font-semibold text-lg">
              I'm okay — reset my timer
            </Text>
          </TouchableOpacity>
          <TouchableOpacity className="items-center mt-6" onPress={() => router.back()}>
            <Text className="text-text-secondary dark:text-dark-text-secondary text-sm">
              Not now
            </Text>
          </TouchableOpacity>
        </>
      )}

      {status === 'loading' && (
        <ActivityIndicator size="large" color="#5B7FA6" />
      )}

      {status === 'done' && (
        <>
          <Text className="text-2xl font-semibold text-success text-center mb-3">
            Check-in complete
          </Text>
          <Text className="text-base text-text-secondary dark:text-dark-text-secondary text-center mb-8">
            {message}
          </Text>
          <TouchableOpacity
            className="bg-primary rounded-lg py-3 items-center"
            onPress={handleDone}
          >
            <Text className="text-white font-medium text-base">Go to Dashboard</Text>
          </TouchableOpacity>
        </>
      )}

      {status === 'error' && (
        <>
          <Text className="text-2xl font-semibold text-destructive text-center mb-3">
            Something went wrong
          </Text>
          <Text className="text-base text-text-secondary dark:text-dark-text-secondary text-center mb-8">
            {message}
          </Text>
          <TouchableOpacity
            className="bg-primary rounded-lg py-3 items-center mb-4"
            onPress={() => setStatus('idle')}
          >
            <Text className="text-white font-medium text-base">Try again</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}
