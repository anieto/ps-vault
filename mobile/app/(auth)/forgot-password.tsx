import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { api } from '@/lib/api';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async () => {
    if (!email) {
      setError('Please enter your email address.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api.forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reset email.');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <View className="flex-1 bg-background dark:bg-dark-bg justify-center px-6">
        <Text className="text-2xl font-semibold text-text-primary dark:text-dark-text-primary mb-3 text-center">
          Check your email
        </Text>
        <Text className="text-base text-text-secondary dark:text-dark-text-secondary text-center mb-8">
          If an account exists for {email}, a password reset link has been sent.
          Tap the link in the email to reset your password.
        </Text>
        <TouchableOpacity
          className="bg-primary rounded-lg py-3 items-center"
          onPress={() => router.replace('/(auth)/login')}
        >
          <Text className="text-white font-medium text-base">Back to sign in</Text>
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
          Forgot password?
        </Text>
        <Text className="text-base text-text-secondary dark:text-dark-text-secondary mb-6">
          Enter your email and we'll send a reset link. If you have a recovery key,
          you can also use that.
        </Text>

        <Text className="text-sm font-medium text-text-primary dark:text-dark-text-primary mb-1">
          Email
        </Text>
        <TextInput
          className="bg-surface dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-4 py-3 text-base text-text-primary dark:text-dark-text-primary mb-1"
          placeholder="you@example.com"
          placeholderTextColor="#9A9490"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          returnKeyType="done"
          onSubmitEditing={handleSubmit}
          autoFocus
        />
        {error ? (
          <Text className="text-destructive text-sm mb-4">{error}</Text>
        ) : (
          <View className="mb-4" />
        )}

        <TouchableOpacity
          className="bg-primary rounded-lg py-3 items-center mb-4"
          onPress={handleSubmit}
          disabled={loading}
        >
          <Text className="text-white font-medium text-base">
            {loading ? 'Sending…' : 'Send reset link'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.back()} className="items-center">
          <Text className="text-text-secondary dark:text-dark-text-secondary text-sm">
            Back to sign in
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
