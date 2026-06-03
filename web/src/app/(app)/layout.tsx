"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Sidebar, MobileNav } from "@/components/layout/sidebar";
import { useAuthStore } from "@/store/auth";
import { clearMEK } from "@/lib/crypto";

const INACTIVITY_TIMEOUT_STORAGE_KEY = "psvault_inactivity_ms";
const DEFAULT_INACTIVITY_MS = 15 * 60 * 1000; // 15 minutes

function getInactivityMs(): number {
  try {
    const v = localStorage.getItem(INACTIVITY_TIMEOUT_STORAGE_KEY);
    if (v === "never") return 0;
    const n = parseInt(v ?? "", 10);
    return isNaN(n) ? DEFAULT_INACTIVITY_MS : n;
  } catch {
    return DEFAULT_INACTIVITY_MS;
  }
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, refresh, logout } = useAuthStore();
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Wait for Zustand to rehydrate from localStorage before running the auth guard.
  // Must not call persist.hasHydrated() during SSR — only safe inside useEffect.
  useEffect(() => {
    if (useAuthStore.persist.hasHydrated()) {
      setHydrated(true);
    } else {
      return useAuthStore.persist.onFinishHydration(() => setHydrated(true));
    }
  }, []);

  // Auth guard — preserve the current path so the user returns to it after login
  useEffect(() => {
    if (hydrated && !isAuthenticated) {
      const returnTo = pathname && pathname !== "/" ? `?return=${encodeURIComponent(pathname)}` : "";
      router.replace(`/login${returnTo}`);
    }
  }, [hydrated, isAuthenticated, router, pathname]);

  // Inactivity timeout
  useEffect(() => {
    const resetTimer = () => {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
      const ms = getInactivityMs();
      if (ms <= 0) return; // "Never" — no timeout
      inactivityTimer.current = setTimeout(() => {
        clearMEK();
        logout();
        router.replace("/login?reason=inactivity");
      }, ms);
    };

    const events = ["mousemove", "keydown", "pointerdown", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      events.forEach((e) => window.removeEventListener(e, resetTimer));
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    };
  }, [logout, router]);

  // Proactive token refresh (every 10 minutes) — extends sessions for active users.
  // Failures are silently ignored; the API client's onAuthFailure handles actual expiry.
  useEffect(() => {
    const interval = setInterval(() => void refresh(), 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [refresh]);

  if (!hydrated || !isAuthenticated) return null;

  return (
    <div className="flex h-dvh overflow-hidden gradient-app">
      {/* Desktop sidebar */}
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto pb-24 md:pb-0">
        <div className="max-w-4xl mx-auto px-4 py-6 md:px-8">
          {children}
        </div>
      </main>

      {/* Mobile bottom nav */}
      <MobileNav />
    </div>
  );
}
