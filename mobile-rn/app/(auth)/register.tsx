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
import { api } from '@/lib/api';
import {
  generateMEKSalt,
  generateMEK,
  deriveKEK,
  wrapMEK,
  bytesToHex,
} from '@/lib/crypto';
import { useAuthStore } from '@/store/auth';
import { useAppStore } from '@/store/app';
import * as storage from '@/lib/storage';

export default function RegisterScreen() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setAuth, setMEK } = useAuthStore();
  const { unlockApp } = useAppStore();
  const router = useRouter();

  const handleRegister = async () => {
    if (!displayName || !email || !password) {
      setError('Please fill in all required fields.');
      return;
    }
    if (password.length < 12) {
      setError('Password must be at least 12 characters.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      // Generate MEK and wrap with KEK before sending anything to the server
      const mekSalt = await generateMEKSalt();
      const mek = await generateMEK();
      const kek = await deriveKEK(password, mekSalt);
      const mekEnvelope = await wrapMEK(mek, kek);

      const data = await api.register({
        email,
        display_name: displayName,
        password,
        invite_code: inviteCode || undefined,
        mek_salt: mekSalt,
        mek_envelope: mekEnvelope,
      });

      await storage.setCryptoSession(data.mek_envelope, data.mek_salt, data.argon2_params);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
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
            Create account
          </Text>
          <Text className="text-base text-text-secondary dark:text-dark-text-secondary mb-8">
            Join your P.S. Vault instance.
          </Text>

          {[
            { label: 'Display name', value: displayName, setter: setDisplayName, placeholder: 'Your name', keyboard: 'default' as const, secure: false },
            { label: 'Email', value: email, setter: setEmail, placeholder: 'you@example.com', keyboard: 'email-address' as const, secure: false },
            { label: 'Password', value: password, setter: setPassword, placeholder: 'Min. 12 characters', keyboard: 'default' as const, secure: true },
            { label: 'Invite code (if required)', value: inviteCode, setter: setInviteCode, placeholder: 'Optional', keyboard: 'default' as const, secure: false },
          ].map(({ label, value, setter, placeholder, keyboard, secure }) => (
            <View key={label} className="mb-4">
              <Text className="text-sm font-medium text-text-primary dark:text-dark-text-primary mb-1">
                {label}
              </Text>
              <TextInput
                className="bg-surface dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-4 text-text-primary dark:text-dark-text-primary"
                style={{ paddingVertical: 14, fontSize: 16 }}
                placeholder={placeholder}
                placeholderTextColor="#9A9490"
                value={value}
                onChangeText={setter}
                autoCapitalize={keyboard === 'email-address' ? 'none' : 'words'}
                keyboardType={keyboard}
                secureTextEntry={secure}
              />
            </View>
          ))}

          {error ? (
            <Text className="text-destructive text-sm mb-4">{error}</Text>
          ) : (
            <View className="mb-4" />
          )}

          <TouchableOpacity
            className="bg-primary rounded-lg py-3 items-center mb-6"
            onPress={handleRegister}
            disabled={loading}
          >
            <Text className="text-white font-medium text-base">
              {loading ? 'Creating account…' : 'Create account'}
            </Text>
          </TouchableOpacity>

          <View className="flex-row justify-center">
            <Text className="text-text-secondary dark:text-dark-text-secondary text-sm">
              Already have an account?{' '}
            </Text>
            <Link href="/(auth)/login" asChild>
              <TouchableOpacity>
                <Text className="text-primary text-sm font-medium">Sign in</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
