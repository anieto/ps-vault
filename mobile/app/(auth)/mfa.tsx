/**
 * MFA setup screen — reached from Settings > Security.
 * (MFA prompt during login is handled inline in login.tsx.)
 */
import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { api } from '@/lib/api';

export default function MFASetupScreen() {
  const router = useRouter();
  const [step, setStep] = useState<'setup' | 'verify' | 'done'>('setup');
  const [secret, setSecret] = useState('');
  const [otpUrl, setOtpUrl] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSetup = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.setupMFA();
      setSecret(data.secret);
      setOtpUrl(data.otp_url);
      setBackupCodes(data.backup_codes);
      setStep('verify');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!code || code.length !== 6) {
      setError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api.verifyMFA({ secret, code, backup_codes: backupCodes });
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView className="flex-1 bg-background dark:bg-dark-bg" contentContainerStyle={{ padding: 24 }}>
      {step === 'setup' && (
        <>
          <Text className="text-2xl font-semibold text-text-primary dark:text-dark-text-primary mb-3">
            Set up two-factor authentication
          </Text>
          <Text className="text-base text-text-secondary dark:text-dark-text-secondary mb-8">
            Add an extra layer of security to your account using an authenticator app.
          </Text>
          {error ? <Text className="text-destructive text-sm mb-4">{error}</Text> : null}
          <TouchableOpacity
            className="bg-primary rounded-lg py-3 items-center"
            onPress={handleSetup}
            disabled={loading}
          >
            <Text className="text-white font-medium text-base">
              {loading ? 'Setting up…' : 'Get started'}
            </Text>
          </TouchableOpacity>
        </>
      )}

      {step === 'verify' && (
        <>
          <Text className="text-2xl font-semibold text-text-primary dark:text-dark-text-primary mb-3">
            Scan the QR code
          </Text>
          <Text className="text-base text-text-secondary dark:text-dark-text-secondary mb-4">
            Open your authenticator app and scan the QR code, or enter this key manually:
          </Text>
          <View className="bg-surface dark:bg-dark-surface rounded-lg p-4 mb-6">
            <Text className="font-mono text-sm text-text-primary dark:text-dark-text-primary text-center select-all">
              {secret}
            </Text>
          </View>
          <Text className="text-sm font-medium text-text-primary dark:text-dark-text-primary mb-1">
            Verification code
          </Text>
          <TextInput
            className="bg-surface dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-4 py-3 text-base text-text-primary dark:text-dark-text-primary mb-1"
            placeholder="000000"
            placeholderTextColor="#9A9490"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            maxLength={6}
            autoFocus
          />
          {error ? (
            <Text className="text-destructive text-sm mb-4">{error}</Text>
          ) : (
            <View className="mb-4" />
          )}
          <TouchableOpacity
            className="bg-primary rounded-lg py-3 items-center"
            onPress={handleVerify}
            disabled={loading}
          >
            <Text className="text-white font-medium text-base">
              {loading ? 'Verifying…' : 'Verify and enable'}
            </Text>
          </TouchableOpacity>
        </>
      )}

      {step === 'done' && (
        <>
          <Text className="text-2xl font-semibold text-success text-center mb-3">
            Two-factor authentication enabled
          </Text>
          <Text className="text-base text-text-secondary dark:text-dark-text-secondary text-center mb-6">
            Save your backup codes in a safe place. Each can only be used once.
          </Text>
          <View className="bg-surface dark:bg-dark-surface rounded-lg p-4 mb-6">
            {backupCodes.map((c) => (
              <Text key={c} className="font-mono text-sm text-text-primary dark:text-dark-text-primary text-center mb-1">
                {c}
              </Text>
            ))}
          </View>
          <TouchableOpacity
            className="bg-primary rounded-lg py-3 items-center"
            onPress={() => router.back()}
          >
            <Text className="text-white font-medium text-base">Done</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}
