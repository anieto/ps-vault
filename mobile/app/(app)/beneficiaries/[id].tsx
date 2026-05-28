import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api } from '@/lib/api';
import type { Beneficiary } from '@/types';

export default function EditBeneficiaryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [beneficiary, setBeneficiary] = useState<Beneficiary | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [relationship, setRelationship] = useState('');
  const [secretQuestion, setSecretQuestion] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const insets = useSafeAreaInsets();
  const router = useRouter();

  useEffect(() => {
    api.listBeneficiaries().then((list) => {
      const b = list.find((b) => b.id === id);
      if (b) {
        setBeneficiary(b);
        setName(b.name);
        setEmail(b.email);
        setRelationship(b.relationship ?? '');
        setSecretQuestion(b.secret_question ?? '');
      }
    }).finally(() => setLoading(false));
  }, [id]);

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required.'); return; }
    if (!email.trim() || !email.includes('@')) { setError('A valid email is required.'); return; }
    setSaving(true);
    setError('');
    try {
      await api.updateBeneficiary(id, {
        name: name.trim(),
        email: email.trim(),
        relationship: relationship.trim() || undefined,
        secret_question: secretQuestion.trim() || undefined,
      });
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Remove beneficiary',
      `Remove ${beneficiary?.name ?? 'this person'} as a beneficiary? They will lose access to any vaults you've shared with them.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await api.deleteBeneficiary(id);
              router.back();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Failed to remove beneficiary.');
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View className="flex-1 bg-background dark:bg-dark-bg items-center justify-center">
        <ActivityIndicator color="#5B7FA6" />
      </View>
    );
  }

  if (!beneficiary) {
    return (
      <View className="flex-1 bg-background dark:bg-dark-bg items-center justify-center px-6">
        <Text className="text-text-secondary dark:text-dark-text-secondary text-base">Beneficiary not found.</Text>
        <TouchableOpacity onPress={() => router.back()} className="mt-4">
          <Text className="text-primary">← Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background dark:bg-dark-bg"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: insets.top + 16 }} keyboardShouldPersistTaps="handled">
        <View className="relative flex-row items-center justify-center mb-6">
          <TouchableOpacity onPress={() => router.back()} className="absolute left-0">
            <Text className="text-primary text-base">← Back</Text>
          </TouchableOpacity>
          <Text className="text-xl font-semibold text-text-primary dark:text-dark-text-primary">
            Edit beneficiary
          </Text>
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
          className="bg-primary rounded-xl py-4 items-center mb-3"
          onPress={handleSave}
          disabled={saving || deleting}
        >
          <Text className="text-white font-semibold text-base">
            {saving ? 'Saving…' : 'Save changes'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="bg-destructive/10 rounded-xl py-4 items-center"
          onPress={handleDelete}
          disabled={saving || deleting}
        >
          <Text className="text-destructive font-semibold text-base">
            {deleting ? 'Removing…' : 'Remove beneficiary'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
