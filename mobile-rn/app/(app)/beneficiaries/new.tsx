import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { api } from '@/lib/api';
import { BackButton } from '@/components/nav-buttons';

export default function NewBeneficiaryScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [relationship, setRelationship] = useState('');
  const [secretQuestion, setSecretQuestion] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required.'); return; }
    if (!email.trim() || !email.includes('@')) { setError('A valid email is required.'); return; }
    setLoading(true);
    setError('');
    try {
      await api.createBeneficiary({
        name: name.trim(),
        email: email.trim(),
        relationship: relationship.trim() || undefined,
        secret_question: secretQuestion.trim() || undefined,
      });
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add beneficiary.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background dark:bg-dark-bg"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: insets.top + 16 }} keyboardShouldPersistTaps="handled">
        <View style={{ marginBottom: 24 }}>
          <BackButton onPress={() => router.back()} />
          <Text style={{ fontSize: 26, fontWeight: '700', marginTop: 10, textAlign: 'center' }} className="text-text-primary dark:text-dark-text-primary">Add beneficiary</Text>
        </View>

        <Text className="text-sm font-medium text-text-primary dark:text-dark-text-primary mb-1">
          Name <Text className="text-destructive">*</Text>
        </Text>
        <TextInput
          className="bg-surface dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-4 text-text-primary dark:text-dark-text-primary mb-4"
          style={{ paddingVertical: 14, fontSize: 16 }}
          placeholder="Full name"
          placeholderTextColor="#9A9490"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          returnKeyType="next"
        />

        <Text className="text-sm font-medium text-text-primary dark:text-dark-text-primary mb-1">
          Email <Text className="text-destructive">*</Text>
        </Text>
        <TextInput
          className="bg-surface dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-4 text-text-primary dark:text-dark-text-primary mb-4"
          style={{ paddingVertical: 14, fontSize: 16 }}
          placeholder="their@email.com"
          placeholderTextColor="#9A9490"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          returnKeyType="next"
        />

        <Text className="text-sm font-medium text-text-primary dark:text-dark-text-primary mb-1">
          Relationship <Text className="text-text-secondary dark:text-dark-text-secondary font-normal">(optional)</Text>
        </Text>
        <TextInput
          className="bg-surface dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-4 text-text-primary dark:text-dark-text-primary mb-4"
          style={{ paddingVertical: 14, fontSize: 16 }}
          placeholder="e.g. Spouse, Child, Attorney"
          placeholderTextColor="#9A9490"
          value={relationship}
          onChangeText={setRelationship}
          returnKeyType="next"
        />

        <Text className="text-sm font-medium text-text-primary dark:text-dark-text-primary mb-1">
          Access key hint <Text className="text-text-secondary dark:text-dark-text-secondary font-normal">(optional)</Text>
        </Text>
        <TextInput
          className="bg-surface dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-4 text-text-primary dark:text-dark-text-primary mb-1"
          style={{ paddingVertical: 14, fontSize: 16 }}
          placeholder="e.g. The name of our family dog"
          placeholderTextColor="#9A9490"
          value={secretQuestion}
          onChangeText={setSecretQuestion}
          returnKeyType="done"
          onSubmitEditing={handleSave}
        />
        <Text className="text-xs text-text-secondary dark:text-dark-text-secondary mb-6">
          Shown on the portal to remind them what access key to enter. Do not write the key itself here.
        </Text>

        {error ? (
          <Text className="text-destructive text-sm mb-4">{error}</Text>
        ) : null}

        <TouchableOpacity
          className="bg-primary rounded-xl py-4 items-center"
          onPress={handleSave}
          disabled={loading}
        >
          <Text className="text-white font-semibold text-base">
            {loading ? 'Adding…' : 'Add beneficiary'}
          </Text>
        </TouchableOpacity>

        <Text className="text-xs text-text-secondary dark:text-dark-text-secondary text-center mt-4">
          You can assign vaults to them after adding.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
