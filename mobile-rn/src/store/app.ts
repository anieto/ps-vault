import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { mmkvStorage } from './mmkv';
import * as storage from '@/lib/storage';
import { api } from '@/lib/api';

interface AppState {
  // Cached in memory from SecureStore (source of truth is SecureStore)
  serverUrl: string | null;

  // App lock
  isLocked: boolean;
  lockTimeoutMs: number; // 0 = never, default 5min

  // Security preferences (persisted to MMKV)
  biometricEnabled: boolean;
  clipboardTimeoutMs: number; // default 30s

  // Hydration flag — prevents router from acting on stale state
  _hasHydrated: boolean;

  setServerUrl: (url: string) => Promise<void>;
  loadServerUrl: () => Promise<void>;
  lockApp: () => void;
  unlockApp: () => void;
  setLockTimeout: (ms: number) => void;
  setBiometricEnabled: (enabled: boolean) => void;
  setClipboardTimeout: (ms: number) => void;
  setHasHydrated: (value: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      serverUrl: null,
      isLocked: false,
      lockTimeoutMs: 5 * 60 * 1000,
      biometricEnabled: false,
      clipboardTimeoutMs: 30 * 1000,
      _hasHydrated: false,

      setServerUrl: async (url) => {
        await storage.setServerUrl(url);
        api.setBaseUrl(url);
        set({ serverUrl: url });
      },

      loadServerUrl: async () => {
        const url = await storage.getServerUrl();
        if (url) {
          api.setBaseUrl(url);
          set({ serverUrl: url });
        }
      },

      lockApp: () => set({ isLocked: true }),

      unlockApp: () => set({ isLocked: false }),

      setLockTimeout: (ms) => set({ lockTimeoutMs: ms }),

      setBiometricEnabled: (enabled) => set({ biometricEnabled: enabled }),

      setClipboardTimeout: (ms) => set({ clipboardTimeoutMs: ms }),

      setHasHydrated: (value) => set({ _hasHydrated: value }),
    }),
    {
      name: 'psvault-app',
      storage: createJSONStorage(() => mmkvStorage),
      // Only persist preference fields — server URL lives in SecureStore
      partialize: (state) => ({
        lockTimeoutMs: state.lockTimeoutMs,
        biometricEnabled: state.biometricEnabled,
        clipboardTimeoutMs: state.clipboardTimeoutMs,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
