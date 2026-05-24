"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "@/types";
import { api } from "@/lib/api";
import { storeMEK, clearMEK } from "@/lib/crypto";

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  setAuth: (user: User, accessToken: string) => void;
  setMEK: (mek: Uint8Array) => void;
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

      logout: () => {
        api.logout().catch(() => {});
        api.setToken(null);
        clearMEK();
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
          get().logout();
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
      },
    }
  )
);
