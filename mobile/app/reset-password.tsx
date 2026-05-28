/**
 * Password reset deep link target.
 * Reached via: psvault://reset-password?token=xxx
 * The token is extracted and passed into the reset flow.
 */
import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api } from '@/lib/api';

export default function ResetPasswordScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleReset = async () => {
    if (password.length < 12) {
      setError('Password must be at least 12 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (!token) {
      setError('Invalid reset link.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <View className="flex-1 bg-background dark:bg-dark-bg justify-center px-6">
        <Text className="text-2xl font-semibold text-success text-center mb-3">
          Password reset
        </Text>
        <Text className="text-base text-text-secondary dark:text-dark-text-secondary text-center mb-8">
          Your password has been updated. Sign in with your new password.
        </Text>
        <TouchableOpacity
          className="bg-primary rounded-lg py-3 items-center"
          onPress={() => router.replace('/(auth)/login')}
        >
          <Text className="text-white font-medium text-base">Sign in</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background dark:bg-dark-bg"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View className="flex-1 justify-center px-6">
        <Text className="text-2xl font-semibold text-text-primary dark:text-dark-text-primary mb-2">
          Reset password
        </Text>
        <Text className="text-base text-text-secondary dark:text-dark-text-secondary mb-6">
          Choose a new password for your account. Minimum 12 characters.
        </Text>

        <TextInput
          className="bg-surface dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-4 py-3 text-base text-text-primary dark:text-dark-text-primary mb-3"
          placeholder="New password"
          placeholderTextColor="#9A9490"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          returnKeyType="next"
        />
        <TextInput
          className="bg-surface dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-4 py-3 text-base text-text-primary dark:text-dark-text-primary mb-1"
          placeholder="Confirm new password"
          placeholderTextColor="#9A9490"
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          returnKeyType="done"
          onSubmitEditing={handleReset}
        />
        {error ? (
          <Text className="text-destructive text-sm mb-4">{error}</Text>
        ) : (
          <View className="mb-4" />
        )}

        <TouchableOpacity
          className="bg-primary rounded-lg py-3 items-center"
          onPress={handleReset}
          disabled={loading}
        >
          <Text className="text-white font-medium text-base">
            {loading ? 'Resetting…' : 'Reset password'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
