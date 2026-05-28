import { create } from 'zustand';
import { api } from '@/lib/api';
import { unwrapCEK } from '@/lib/crypto';
import type { Vault, VaultEntry } from '@/types';

interface VaultState {
  vaults: Vault[];
  // CEKs in memory only — keyed by vault ID
  ceks: Record<string, Uint8Array>;
  // Decrypted entries in memory — keyed by vault ID
  entries: Record<string, VaultEntry[]>;
  isLoading: boolean;
  error: string | null;

  loadVaults: (mek: Uint8Array) => Promise<void>;
  loadEntries: (vaultId: string) => Promise<void>;
  getCEK: (vaultId: string) => Uint8Array | null;
  // Clear all decrypted data (on lock or logout)
  clearAll: () => void;
}

export const useVaultStore = create<VaultState>((set, get) => ({
  vaults: [],
  ceks: {},
  entries: {},
  isLoading: false,
  error: null,

  loadVaults: async (mek) => {
    set({ isLoading: true, error: null });
    try {
      const vaults = await api.listVaults();
      // Unwrap CEKs for all vaults now so they're ready for entry decryption
      const ceks: Record<string, Uint8Array> = {};
      await Promise.all(
        vaults.map(async (vault) => {
          try {
            ceks[vault.id] = await unwrapCEK(vault.cek_envelope, mek);
          } catch {
            // CEK unwrap failure is non-fatal — vault will appear locked
          }
        })
      );
      set({ vaults, ceks });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load vaults' });
    } finally {
      set({ isLoading: false });
    }
  },

  loadEntries: async (vaultId) => {
    set({ isLoading: true, error: null });
    try {
      const entries = await api.listEntries(vaultId);
      set((s) => ({ entries: { ...s.entries, [vaultId]: entries } }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load entries' });
    } finally {
      set({ isLoading: false });
    }
  },

  getCEK: (vaultId) => get().ceks[vaultId] ?? null,

  clearAll: () => set({ vaults: [], ceks: {}, entries: {}, error: null }),
}));
