import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/auth';
import { useAppStore } from '@/store/app';

export default function LockScreen() {
  const { unlockWithBiometric, unlockWithPassword, logout } = useAuthStore();
  const { biometricEnabled, unlockApp } = useAppStore();
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // Auto-prompt biometric on mount
  useEffect(() => {
    if (biometricEnabled) handleBiometric();
  }, []);

  const handleBiometric = async () => {
    const success = await unlockWithBiometric();
    if (success) {
      unlockApp();
      router.replace('/(app)');
    } else {
      setShowPassword(true);
    }
  };

  const handlePassword = async () => {
    if (!password) return;
    setLoading(true);
    setError('');
    const success = await unlockWithPassword(password);
    setLoading(false);
    if (success) {
      unlockApp();
      router.replace('/(app)');
    } else {
      setError('Incorrect password. Please try again.');
    }
  };

  const handleLogout = async () => {
    await logout();
    router.replace('/(auth)/login');
  };

  return (
    <View className="flex-1 bg-background dark:bg-dark-bg justify-center px-6">
      <Text className="text-2xl font-semibold text-text-primary dark:text-dark-text-primary mb-2 text-center">
        Vault Locked
      </Text>
      <Text className="text-base text-text-secondary dark:text-dark-text-secondary text-center mb-8">
        Authenticate to continue.
      </Text>

      {biometricEnabled && !showPassword && (
        <TouchableOpacity
          className="bg-primary rounded-lg py-3 items-center mb-4"
          onPress={handleBiometric}
        >
          <Text className="text-white font-medium text-base">Unlock with Face ID / Touch ID</Text>
        </TouchableOpacity>
      )}

      {(showPassword || !biometricEnabled) && (
        <>
          <TextInput
            className="bg-surface dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-4 py-3 text-base text-text-primary dark:text-dark-text-primary mb-1"
            placeholder="Password"
            placeholderTextColor="#9A9490"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={handlePassword}
            autoFocus
          />
          {error ? (
            <Text className="text-destructive text-sm mb-3">{error}</Text>
          ) : (
            <View className="mb-3" />
          )}
          <TouchableOpacity
            className="bg-primary rounded-lg py-3 items-center mb-4"
            onPress={handlePassword}
            disabled={loading}
          >
            <Text className="text-white font-medium text-base">
              {loading ? 'Unlocking…' : 'Unlock'}
            </Text>
          </TouchableOpacity>
        </>
      )}

      <TouchableOpacity onPress={handleLogout} className="items-center mt-4">
        <Text className="text-text-secondary dark:text-dark-text-secondary text-sm">
          Sign out instead
        </Text>
      </TouchableOpacity>
    </View>
  );
}
