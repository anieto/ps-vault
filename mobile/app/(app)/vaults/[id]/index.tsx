import { useEffect, useState, useCallback } from 'react';
import { View, Text, SectionList, TouchableOpacity, ActivityIndicator, TextInput, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { UserPlus, Trash2, MailCheck, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react-native';
import { BackButton, AddButton } from '@/components/nav-buttons';
import { useVaultStore } from '@/store/vault';
import { wrapCEKForBeneficiary } from '@/lib/crypto';
import { api } from '@/lib/api';
import type { EntryType, Beneficiary, VaultEntry } from '@/types';

const ENTRY_GROUPS: { type: string; label: string; emoji: string }[] = [
  { type: 'contact',   label: 'Contacts',            emoji: '👤' },
  { type: 'login',     label: 'Logins',               emoji: '🔑' },
  { type: 'financial', label: 'Financial Accounts',   emoji: '🏦' },
  { type: 'card',      label: 'Cards',                emoji: '💳' },
  { type: 'identity',  label: 'Identity Documents',   emoji: '🪪' },
  { type: 'crypto',    label: 'Crypto',               emoji: '🪙' },
  { type: 'file',      label: 'Documents',            emoji: '📎' },
  { type: 'note',      label: 'Notes',                emoji: '📝' },
  { type: 'custom',    label: 'Other',                emoji: '⚙️' },
];

const KNOWN_TYPES = new Set(ENTRY_GROUPS.map((g) => g.type));

type VaultBeneficiary = {
  id: string;
  vault_id: string;
  beneficiary_id: string;
  additional_delay_days: number;
  created_at: string;
  beneficiary_name: string;
  beneficiary_email: string;
  email_confirmed: boolean;
};

export default function VaultDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { vaults, entries, ceks, loadEntries, isLoading } = useVaultStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const vault = vaults.find((v) => v.id === id);
  const vaultEntries = entries[id] ?? [];
  const cek = id ? ceks[id] : null;

  const [vaultBeneficiaries, setVaultBeneficiaries] = useState<VaultBeneficiary[]>([]);
  const [allBeneficiaries, setAllBeneficiaries] = useState<Beneficiary[]>([]);
  const [showGrantForm, setShowGrantForm] = useState(false);
  const [selectedBeneficiaryId, setSelectedBeneficiaryId] = useState('');
  const [accessKey, setAccessKey] = useState('');
  const [grantLoading, setGrantLoading] = useState(false);
  const [revokeLoading, setRevokeLoading] = useState<string | null>(null);
  const [grantError, setGrantError] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set([...ENTRY_GROUPS.map((g) => g.type), '_other'])
  );

  const toggleGroup = (type: string) =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      next.has(type) ? next.delete(type) : next.add(type);
      return next;
    });

  // Build grouped sections for SectionList
  const rawGroups = [
    ...ENTRY_GROUPS
      .map((g) => ({
        type: g.type,
        title: g.label,
        emoji: g.emoji,
        allItems: vaultEntries
          .filter((e) => e.entry_type === g.type)
          .sort((a, b) => {
            if (a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1;
            return (a.sort_order ?? 0) - (b.sort_order ?? 0);
          }),
      }))
      .filter((g) => g.allItems.length > 0),
    ...(vaultEntries.filter((e) => !KNOWN_TYPES.has(e.entry_type)).length > 0
      ? [{ type: '_other', title: 'Other', emoji: '⚙️', allItems: vaultEntries.filter((e) => !KNOWN_TYPES.has(e.entry_type)) }]
      : []),
  ];

  const sections = rawGroups.map((g) => ({
    ...g,
    data: collapsedGroups.has(g.type) ? [] : g.allItems,
  }));

  const loadAccess = useCallback(() => {
    if (!id) return;
    api.getVaultBeneficiaries(id).then(setVaultBeneficiaries).catch(() => {});
    api.listBeneficiaries().then(setAllBeneficiaries).catch(() => {});
  }, [id]);

  useEffect(() => {
    if (id) { loadEntries(id); loadAccess(); }
  }, [id]);

  const assignedIds = new Set(vaultBeneficiaries.map((vb) => vb.beneficiary_id));
  const availableBeneficiaries = allBeneficiaries.filter((b) => !assignedIds.has(b.id));

  const handleGrant = async () => {
    if (!cek || !selectedBeneficiaryId || !accessKey.trim()) {
      setGrantError('Please select a beneficiary and enter an access key.');
      return;
    }
    setGrantLoading(true);
    setGrantError('');
    try {
      const envelope = await wrapCEKForBeneficiary(cek, accessKey.trim());
      await api.assignBeneficiaryToVault(id, {
        beneficiary_id: selectedBeneficiaryId,
        beneficiary_cek_envelope: envelope,
      });
      setShowGrantForm(false);
      setSelectedBeneficiaryId('');
      setAccessKey('');
      loadAccess();
    } catch (err) {
      setGrantError(err instanceof Error ? err.message : 'Failed to grant access.');
    } finally {
      setGrantLoading(false);
    }
  };

  const handleRevoke = (beneficiaryId: string, name: string) => {
    Alert.alert(
      'Revoke access',
      `Revoke ${name}'s access to this vault?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: async () => {
            setRevokeLoading(beneficiaryId);
            try {
              await api.removeVaultBeneficiary(id, beneficiaryId);
              loadAccess();
            } catch {
              Alert.alert('Error', 'Failed to revoke access.');
            } finally {
              setRevokeLoading(null);
            }
          },
        },
      ]
    );
  };

  if (!vault) {
    return (
      <View className="flex-1 bg-background dark:bg-dark-bg items-center justify-center">
        <Text className="text-text-secondary dark:text-dark-text-secondary">Vault not found.</Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View className="flex-1 bg-background dark:bg-dark-bg items-center justify-center">
        <ActivityIndicator color="#5B7FA6" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background dark:bg-dark-bg">
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 24, paddingBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <BackButton onPress={() => router.back()} />
          <AddButton onPress={() => router.push(`/(app)/vaults/${id}/entry/new`)} />
        </View>
        <Text style={{ fontSize: 26, fontWeight: '700', marginTop: 10, textAlign: 'center' }} className="text-text-primary dark:text-dark-text-primary" numberOfLines={1}>
          {vault.icon} {vault.name}
        </Text>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        stickySectionHeadersEnabled={false}
        renderItem={({ item, index, section }: { item: VaultEntry; index: number; section: { data: VaultEntry[] } }) => {
          const isLast = index === section.data.length - 1;
          return (
            <TouchableOpacity
              className={`bg-surface dark:bg-dark-surface px-4 py-3 flex-row items-center border-t border-border ${isLast ? 'rounded-b-xl' : ''}`}
              onPress={() => router.push(`/(app)/vaults/${id}/entry/${item.id}`)}
            >
              {item.is_favorite && (
                <Text style={{ fontSize: 14, marginRight: 6 }} className="text-amber-400">★</Text>
              )}
              <Text style={{ fontSize: 15, fontWeight: '500', flex: 1 }} className="text-text-primary dark:text-dark-text-primary">
                {item.title}
              </Text>
              <Text style={{ fontSize: 18 }} className="text-text-muted">›</Text>
            </TouchableOpacity>
          );
        }}
        renderSectionHeader={({ section }) => (
          <TouchableOpacity
            className={`flex-row items-center justify-between px-4 py-3 bg-surface dark:bg-dark-surface mt-3 ${collapsedGroups.has(section.type) ? 'rounded-xl' : 'rounded-t-xl'}`}
            onPress={() => toggleGroup(section.type)}
            activeOpacity={0.7}
          >
            <View className="flex-row items-center gap-2">
              <Text style={{ fontSize: 15 }}>{section.emoji}</Text>
              <Text style={{ fontSize: 14, fontWeight: '600' }} className="text-text-primary dark:text-dark-text-primary">
                {section.title}
              </Text>
              <View className="px-2 py-0.5 rounded-full bg-surface-muted dark:bg-dark-surface-muted">
                <Text style={{ fontSize: 11, fontWeight: '500' }} className="text-text-muted dark:text-dark-text-muted">
                  {section.allItems.length}
                </Text>
              </View>
            </View>
            {collapsedGroups.has(section.type)
              ? <ChevronDown size={16} color="#9A9490" />
              : <ChevronUp size={16} color="#9A9490" />}
          </TouchableOpacity>
        )}
        renderSectionFooter={() => null}
        ListHeaderComponent={
          <View className="flex-row items-center justify-between mb-1">
            <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.8 }} className="text-text-secondary dark:text-dark-text-secondary uppercase">
              Contents ({vaultEntries.length})
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View className="items-center mt-8 mb-4">
            <Text style={{ fontSize: 14 }} className="text-text-secondary dark:text-dark-text-secondary">
              No entries yet.
            </Text>
          </View>
        }
        ListFooterComponent={
          <View className="mt-6">
            {/* Access section header */}
            <View className="flex-row items-center justify-between mb-3">
              <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.8 }} className="text-text-secondary dark:text-dark-text-secondary uppercase">
                Access ({vaultBeneficiaries.length})
              </Text>
              {cek && !showGrantForm && (
                <TouchableOpacity
                  className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border"
                  onPress={() => setShowGrantForm(true)}
                >
                  <UserPlus size={13} color="#5B7FA6" />
                  <Text style={{ fontSize: 13, fontWeight: '500' }} className="text-primary">
                    Grant access
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Granted beneficiary rows */}
            {vaultBeneficiaries.map((vb) => (
              <View
                key={vb.beneficiary_id}
                className="bg-surface dark:bg-dark-surface rounded-xl px-4 py-3 mb-2 flex-row items-center justify-between"
              >
                <View className="flex-1 mr-3">
                  <Text style={{ fontSize: 14, fontWeight: '500' }} className="text-text-primary dark:text-dark-text-primary">
                    {vb.beneficiary_name}
                  </Text>
                  <Text style={{ fontSize: 12 }} className="text-text-secondary dark:text-dark-text-secondary mt-0.5">
                    {vb.beneficiary_email}
                  </Text>
                </View>
                <View className="flex-row items-center gap-2">
                  <View className="flex-row items-center gap-1 px-2 py-0.5 rounded-full bg-surface-muted dark:bg-dark-surface-muted">
                    {vb.email_confirmed
                      ? <CheckCircle2 size={11} color="#22c55e" />
                      : <MailCheck size={11} color="#9A9490" />}
                    <Text style={{ fontSize: 11, fontWeight: '500' }} className={vb.email_confirmed ? 'text-green-600' : 'text-text-muted dark:text-dark-text-muted'}>
                      {vb.email_confirmed ? 'Confirmed' : 'Invited'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleRevoke(vb.beneficiary_id, vb.beneficiary_name)}
                    disabled={revokeLoading === vb.beneficiary_id}
                    className="p-1.5"
                  >
                    {revokeLoading === vb.beneficiary_id
                      ? <ActivityIndicator size="small" color="#ef4444" />
                      : <Trash2 size={15} color="#ef4444" />}
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            {vaultBeneficiaries.length === 0 && !showGrantForm && (
              <Text style={{ fontSize: 13 }} className="text-text-muted dark:text-dark-text-muted mb-3">
                No beneficiaries have access to this vault yet.
              </Text>
            )}

            {/* Grant access form */}
            {showGrantForm && cek && (
              <View className="bg-surface dark:bg-dark-surface rounded-xl p-4 mb-3">
                <Text style={{ fontSize: 14, fontWeight: '600' }} className="text-text-primary dark:text-dark-text-primary mb-1">
                  Grant vault access
                </Text>
                <Text style={{ fontSize: 12 }} className="text-text-secondary dark:text-dark-text-secondary mb-4">
                  Set an access key and share it with the beneficiary out of band — it's never stored on the server.
                </Text>

                {/* Beneficiary picker */}
                <Text style={{ fontSize: 12, fontWeight: '500' }} className="text-text-secondary dark:text-dark-text-secondary mb-2">
                  Select beneficiary
                </Text>
                {availableBeneficiaries.length === 0 ? (
                  <Text style={{ fontSize: 12 }} className="text-text-muted dark:text-dark-text-muted mb-3">
                    {allBeneficiaries.length === 0
                      ? 'No beneficiaries yet. Add one from the Beneficiaries tab.'
                      : 'All beneficiaries already have access.'}
                  </Text>
                ) : (
                  availableBeneficiaries.map((b) => (
                    <TouchableOpacity
                      key={b.id}
                      className={`flex-row items-center px-3 py-2.5 rounded-lg mb-1.5 border ${selectedBeneficiaryId === b.id ? 'border-primary bg-primary/5' : 'border-border'}`}
                      onPress={() => setSelectedBeneficiaryId(b.id)}
                    >
                      <View className="flex-1">
                        <Text style={{ fontSize: 14, fontWeight: selectedBeneficiaryId === b.id ? '600' : '400' }} className="text-text-primary dark:text-dark-text-primary">
                          {b.name}
                        </Text>
                        <Text style={{ fontSize: 12 }} className="text-text-secondary dark:text-dark-text-secondary">
                          {b.email}
                        </Text>
                      </View>
                      {selectedBeneficiaryId === b.id && (
                        <CheckCircle2 size={16} color="#5B7FA6" />
                      )}
                    </TouchableOpacity>
                  ))
                )}

                {/* Access key input */}
                <Text style={{ fontSize: 12, fontWeight: '500' }} className="text-text-secondary dark:text-dark-text-secondary mt-3 mb-1">
                  Access key
                </Text>
                <TextInput
                  className="bg-background dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 text-text-primary dark:text-dark-text-primary mb-1"
                  style={{ paddingVertical: 12, fontSize: 15 }}
                  placeholder="A word or phrase to share privately"
                  placeholderTextColor="#9A9490"
                  value={accessKey}
                  onChangeText={setAccessKey}
                  autoCapitalize="none"
                  returnKeyType="done"
                  onSubmitEditing={handleGrant}
                />
                <Text style={{ fontSize: 11 }} className="text-text-muted dark:text-dark-text-muted mb-3">
                  Share this key with them in person, via Signal, or in a letter — not here.
                </Text>

                {grantError ? (
                  <Text style={{ fontSize: 12 }} className="text-destructive mb-3">{grantError}</Text>
                ) : null}

                <View className="flex-row gap-2 justify-end">
                  <TouchableOpacity
                    className="px-4 py-2.5 rounded-lg border border-border"
                    onPress={() => { setShowGrantForm(false); setSelectedBeneficiaryId(''); setAccessKey(''); setGrantError(''); }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '500' }} className="text-text-secondary dark:text-dark-text-secondary">
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    className="px-4 py-2.5 rounded-lg bg-primary"
                    onPress={handleGrant}
                    disabled={grantLoading || !selectedBeneficiaryId || !accessKey.trim()}
                    style={{ opacity: grantLoading || !selectedBeneficiaryId || !accessKey.trim() ? 0.5 : 1 }}
                  >
                    {grantLoading
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={{ fontSize: 14, fontWeight: '600', color: '#fff' }}>Grant access</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <Text style={{ fontSize: 11 }} className="text-text-muted dark:text-dark-text-muted mt-1">
              Each beneficiary needs a unique access key you share with them privately.
            </Text>
          </View>
        }
      />
    </View>
  );
}
