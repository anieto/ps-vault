import { create } from 'zustand';
import * as LocalAuthentication from 'expo-local-authentication';
import { api } from '@/lib/api';
import * as storage from '@/lib/storage';
import { deriveKEK, unwrapMEK, bytesToHex, hexToBytes } from '@/lib/crypto';
import type { User } from '@/types';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  mek: Uint8Array | null; // in memory only — never serialised
  isAuthenticated: boolean;
  isLoading: boolean;

  // Bootstraps on app launch: loads server URL, tries silent refresh
  initialize: () => Promise<void>;

  // Called after successful login/register
  setAuth: (
    user: User,
    accessToken: string,
    refreshToken: string,
    mekEnvelope: string,
    mekSalt: string,
    argon2Params: string
  ) => Promise<void>;

  // Sets MEK in memory after unlock (biometric or password)
  setMEK: (mek: Uint8Array) => void;

  // Unlock using cached MEK from secure store (biometric gate)
  unlockWithBiometric: () => Promise<boolean>;

  // Unlock by re-deriving MEK from password
  unlockWithPassword: (password: string) => Promise<boolean>;

  logout: () => Promise<void>;

  // Silent token refresh — called by API client on 401
  refresh: () => Promise<boolean>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  mek: null,
  isAuthenticated: false,
  isLoading: true,

  initialize: async () => {
    set({ isLoading: true });
    try {
      const serverUrl = await storage.getServerUrl();
      if (!serverUrl) {
        set({ isLoading: false });
        return;
      }
      api.setBaseUrl(serverUrl);

      const refreshToken = await storage.getRefreshToken();
      if (!refreshToken) {
        set({ isLoading: false });
        return;
      }

      // Wire up silent refresh callback
      api.setOnTokenRefreshed((token, user) => {
        set({ accessToken: token, user, isAuthenticated: true });
      });
      api.setOnAuthExpired(() => {
        get().logout();
      });

      api.setTokens(null, refreshToken);
      const data = await api.refresh();
      api.setTokens(data.access_token, data.refresh_token);
      await storage.setRefreshToken(data.refresh_token);

      set({
        user: data.user,
        accessToken: data.access_token,
        isAuthenticated: true,
      });
    } catch {
      // Refresh failed — user must log in again
      await storage.deleteRefreshToken();
      set({ isAuthenticated: false });
    } finally {
      set({ isLoading: false });
    }
  },

  setAuth: async (user, accessToken, refreshToken, mekEnvelope, mekSalt, argon2Params) => {
    api.setTokens(accessToken, refreshToken ?? null);
    if (refreshToken) {
      await storage.setRefreshToken(refreshToken);
    }
    await storage.setCryptoSession(mekEnvelope, mekSalt, argon2Params);
    set({ user, accessToken, isAuthenticated: true });
  },

  setMEK: (mek) => {
    set({ mek });
  },

  unlockWithBiometric: async () => {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock P.S. Vault',
      fallbackLabel: 'Use password',
    });
    if (!result.success) return false;

    const mekHex = await storage.getMEKHex();
    if (!mekHex) return false;

    set({ mek: hexToBytes(mekHex) });
    return true;
  },

  unlockWithPassword: async (password) => {
    const session = await storage.getCryptoSession();
    if (!session) return false;

    try {
      const params = JSON.parse(session.argon2Params);
      const kek = await deriveKEK(password, session.mekSalt, params);
      const mek = await unwrapMEK(session.mekEnvelope, kek);

      // Cache MEK in secure store so biometric unlock works next time
      await storage.setMEKHex(bytesToHex(mek));
      set({ mek });
      return true;
    } catch {
      return false;
    }
  },

  logout: async () => {
    try {
      await api.deletePushToken().catch(() => {});
      await api.logout().catch(() => {});
    } finally {
      api.setTokens(null, null);
      await storage.clearAll();
      set({ user: null, accessToken: null, mek: null, isAuthenticated: false });
    }
  },

  refresh: async () => {
    try {
      const data = await api.refresh();
      api.setTokens(data.access_token, data.refresh_token);
      await storage.setRefreshToken(data.refresh_token);
      set({ user: data.user, accessToken: data.access_token, isAuthenticated: true });
      return true;
    } catch {
      await get().logout();
      return false;
    }
  },
}));
