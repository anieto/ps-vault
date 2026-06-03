"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "@/types";
import { api } from "@/lib/api";
import { storeMEK, clearMEK, storeCryptoSession, clearCryptoSession } from "@/lib/crypto";

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  setAuth: (user: User, accessToken: string) => void;
  setMEK: (mek: Uint8Array) => void;
  setCryptoSession: (mekEnvelope: string, mekSalt: string, argon2Params: string) => void;
  logout: () => void;
  refresh: () => Promise<boolean>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      isLoading: false,
      isAuthenticated: false,

      setAuth: (user, accessToken) => {
        api.setToken(accessToken);
        set({ user, accessToken, isAuthenticated: true });
      },

      setMEK: (mek: Uint8Array) => {
        storeMEK(mek);
      },

      setCryptoSession: (mekEnvelope: string, mekSalt: string, argon2Params: string) => {
        storeCryptoSession(mekEnvelope, mekSalt, argon2Params);
      },

      logout: () => {
        api.logout().catch(() => {});
        api.setToken(null);
        clearCryptoSession();
        set({ user: null, accessToken: null, isAuthenticated: false });
      },

      refresh: async () => {
        try {
          const result = await api.refresh();
          api.setToken(result.access_token);
          set({
            user: result.user,
            accessToken: result.access_token,
            isAuthenticated: true,
          });
          return true;
        } catch {
          // Do not logout here. Actual session expiry is handled by the API
          // client's onAuthFailure (triggered when a real request gets 401 and
          // the subsequent refresh also fails). Calling logout() here causes
          // race-condition logouts when the proactive refresh races with the
          // API client's own 401-triggered refresh.
          return false;
        }
      },
    }),
    {
      name: "psvault-auth",
      // Only persist non-sensitive fields
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        // Re-apply token to API client after hydration
        if (state?.accessToken) {
          api.setToken(state.accessToken);
        }
        // Keep store in sync when API client silently refreshes the token
        api.setOnTokenRefreshed((token, user) => {
          useAuthStore.setState({ user, accessToken: token, isAuthenticated: true });
        });
        // Clear local state when the refresh token is also expired.
        // Do NOT call logout() here: logout() calls api.logout() which goes through
        // the request pipeline. A 401 on that logout request triggers ANOTHER refresh
        // attempt — if it succeeds (racing with a fresh login) it re-authenticates
        // silently; if it fails, onAuthFailure fires a second time, causing a redirect loop.
        api.setOnAuthFailure(() => {
          api.setToken(null);
          clearCryptoSession();
          useAuthStore.setState({ user: null, accessToken: null, isAuthenticated: false });
        });
      },
    }
  )
);
