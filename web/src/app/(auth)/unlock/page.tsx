"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { deriveKEK, unwrapMEK, storeMEK, getCryptoSession } from "@/lib/crypto";
import { useAuthStore } from "@/store/auth";
import type { Argon2Params } from "@/types";

export default function UnlockPage() {
  return (
    <Suspense>
      <UnlockForm />
    </Suspense>
  );
}

function UnlockForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, logout } = useAuthStore();
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const returnTo = searchParams.get("return") ?? "/vaults";

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;

    const session = getCryptoSession();
    if (!session) {
      // No session data — need full login
      router.replace("/login");
      return;
    }

    setIsLoading(true);
    try {
      const { mekEnvelope, mekSalt, argon2Params: argon2ParamsStr } = session;
      const argon2Params: Argon2Params = JSON.parse(argon2ParamsStr);
      const kek = await deriveKEK(password, mekSalt, argon2Params);
      const mek = await unwrapMEK(mekEnvelope, kek);
      storeMEK(mek);
      router.replace(returnTo);
    } catch {
      toast({ title: "Incorrect password. Please try again.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-1">
        <div className="flex justify-center mb-3">
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Lock className="h-6 w-6 text-primary" />
          </div>
        </div>
        <h1 className="text-xl font-semibold text-text-primary">Vault locked</h1>
        <p className="text-sm text-text-secondary">
          {user?.display_name
            ? `Welcome back, ${user.display_name}. `
            : ""}
          Enter your password to continue.
        </p>
      </div>

      <form onSubmit={handleUnlock} className="space-y-4">
        <PasswordInput
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          autoComplete="current-password"
        />

        <Button type="submit" className="w-full" disabled={isLoading || !password}>
          {isLoading ? "Unlocking…" : "Unlock"}
        </Button>
      </form>

      <div className="text-center">
        <button
          type="button"
          className="text-sm text-text-muted hover:text-text-secondary transition-colors"
          onClick={() => {
            logout();
            router.replace("/login");
          }}
        >
          Sign in as a different user
        </button>
      </div>
    </div>
  );
}
