import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { api, APIError } from '@/lib/api';
import { deriveKEK, unwrapMEK, bytesToHex } from '@/lib/crypto';
import { useAuthStore } from '@/store/auth';
import { useAppStore } from '@/store/app';
import * as storage from '@/lib/storage';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [needsMFA, setNeedsMFA] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const { setAuth, setMEK } = useAuthStore();
  const { unlockApp } = useAppStore();
  const router = useRouter();

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await api.login({ email, password, mfa_code: needsMFA ? mfaCode : undefined });

      // Derive KEK → unwrap MEK
      const params = JSON.parse(data.argon2_params);
      const kek = await deriveKEK(password, data.mek_salt, params);
      const mek = await unwrapMEK(data.mek_envelope, kek);

      // Cache MEK in SecureStore for biometric unlock
      await storage.setMEKHex(bytesToHex(mek));

      await setAuth(
        data.user,
        data.access_token,
        data.refresh_token,
        data.mek_envelope,
        data.mek_salt,
        data.argon2_params
      );
      setMEK(mek);
      unlockApp();
      router.replace('/(app)');
    } catch (err: unknown) {
      if (err instanceof APIError && err.code === 'mfa_required') {
        setNeedsMFA(true);
        setError('Enter your authenticator code below.');
      } else {
        setError(err instanceof Error ? err.message : 'Login failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background dark:bg-dark-bg"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View className="flex-1 justify-center px-6 py-12">
          <Text className="text-3xl font-semibold text-text-primary dark:text-dark-text-primary mb-1">
            Sign in
          </Text>
          <Text className="text-base text-text-secondary dark:text-dark-text-secondary mb-8">
            Welcome back to P.S. Vault.
          </Text>

          <Text className="text-sm font-medium text-text-primary dark:text-dark-text-primary mb-1">
            Email
          </Text>
          <TextInput
            className="bg-surface dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-4 text-text-primary dark:text-dark-text-primary mb-4"
            style={{ paddingVertical: 14, fontSize: 16 }}
            placeholder="you@example.com"
            placeholderTextColor="#9A9490"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            returnKeyType="next"
          />

          <Text className="text-sm font-medium text-text-primary dark:text-dark-text-primary mb-1">
            Password
          </Text>
          <TextInput
            className="bg-surface dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-4 text-text-primary dark:text-dark-text-primary mb-4"
            style={{ paddingVertical: 14, fontSize: 16 }}
            placeholder="Password"
            placeholderTextColor="#9A9490"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            returnKeyType={needsMFA ? 'next' : 'done'}
            onSubmitEditing={needsMFA ? undefined : handleLogin}
          />

          {needsMFA && (
            <>
              <Text className="text-sm font-medium text-text-primary dark:text-dark-text-primary mb-1">
                Authenticator code
              </Text>
              <TextInput
                className="bg-surface dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-4 text-text-primary dark:text-dark-text-primary mb-4"
            style={{ paddingVertical: 14, fontSize: 16 }}
                placeholder="000000"
                placeholderTextColor="#9A9490"
                value={mfaCode}
                onChangeText={setMfaCode}
                keyboardType="number-pad"
                returnKeyType="done"
                onSubmitEditing={handleLogin}
                maxLength={6}
                autoFocus
              />
            </>
          )}

          {error ? (
            <Text className="text-destructive text-sm mb-4">{error}</Text>
          ) : (
            <View className="mb-4" />
          )}

          <TouchableOpacity
            className="bg-primary rounded-lg py-3 items-center mb-4"
            onPress={handleLogin}
            disabled={loading}
          >
            <Text className="text-white font-medium text-base">
              {loading ? 'Signing in…' : 'Sign in'}
            </Text>
          </TouchableOpacity>

          <Link href="/(auth)/forgot-password" asChild>
            <TouchableOpacity className="items-center mb-6">
              <Text className="text-primary text-sm">Forgot password?</Text>
            </TouchableOpacity>
          </Link>

          <View className="flex-row justify-center">
            <Text className="text-text-secondary dark:text-dark-text-secondary text-sm">
              Don't have an account?{' '}
            </Text>
            <Link href="/(auth)/register" asChild>
              <TouchableOpacity>
                <Text className="text-primary text-sm font-medium">Register</Text>
              </TouchableOpacity>
            </Link>
          </View>

          <TouchableOpacity
            className="items-center mt-6"
            onPress={() => router.replace('/setup')}
          >
            <Text className="text-text-secondary dark:text-dark-text-secondary text-xs">
              Wrong server?{' '}
              <Text className="text-primary">Change server URL</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
