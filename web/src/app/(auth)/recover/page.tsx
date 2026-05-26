"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CheckCircle2, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, PasswordInput, PasswordStrengthMeter } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { api, APIError } from "@/lib/api";
import {
  validateRecoveryMnemonic,
  unwrapMEKWithRecoveryKey,
  deriveKEK,
  wrapMEK,
} from "@/lib/crypto";
import type { Argon2Params } from "@/types";

export default function RecoverPage() {
  return <Suspense><RecoverFlow /></Suspense>;
}

function RecoverFlow() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  if (token) {
    return <SetNewPassword token={token} />;
  }
  return <RequestRecovery />;
}

// ─── Step 1: Enter email to receive recovery link ────────────────────────────

const requestSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

type RequestForm = z.infer<typeof requestSchema>;

function RequestRecovery() {
  const [sent, setSent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<RequestForm>({
    resolver: zodResolver(requestSchema),
  });

  const onSubmit = async (data: RequestForm) => {
    setIsLoading(true);
    try {
      await api.recoverStart(data.email);
    } finally {
      setSent(true);
      setIsLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="text-center space-y-4">
        <div className="h-12 w-12 rounded-full bg-success-50 flex items-center justify-center mx-auto">
          <CheckCircle2 className="h-6 w-6 text-success-700" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Check your email</h1>
          <p className="text-sm text-text-secondary mt-2">
            If an account with a recovery key exists at that address, we&apos;ve sent a recovery link.
          </p>
        </div>
        <Link href="/login" className="text-sm text-primary hover:underline block">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2 mb-1">
        <KeyRound className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-semibold text-text-primary">Recover your account</h1>
      </div>
      <p className="text-sm text-text-secondary mb-6">
        Enter your email and we&apos;ll send a recovery link. You&apos;ll need your 24-word recovery key to complete the process.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <Input
          label="Email address"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register("email")}
        />
        <Button type="submit" loading={isLoading} className="w-full">
          Send recovery link
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-text-secondary">
        <Link href="/forgot-password" className="text-primary font-medium hover:underline">
          Back to password reset
        </Link>
      </p>
    </>
  );
}

// ─── Step 2: Enter recovery mnemonic + new password ──────────────────────────

const newPasswordSchema = z.object({
  mnemonic: z.string().min(1, "Recovery key is required"),
  password: z.string().min(12, "Password must be at least 12 characters"),
  password_confirm: z.string().min(1, "Please confirm your password"),
}).refine((d) => d.password === d.password_confirm, {
  message: "Passwords don't match",
  path: ["password_confirm"],
});

type NewPasswordForm = z.infer<typeof newPasswordSchema>;

function SetNewPassword({ token }: { token: string }) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [done, setDone] = useState(false);

  const { register, handleSubmit, watch, formState: { errors } } = useForm<NewPasswordForm>({
    resolver: zodResolver(newPasswordSchema),
  });

  const passwordValue = watch("password", "");

  const onSubmit = async (data: NewPasswordForm) => {
    const mnemonic = data.mnemonic.trim().toLowerCase();

    if (!validateRecoveryMnemonic(mnemonic)) {
      toast({ title: "Invalid recovery key. Please check your 24 words and try again.", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    try {
      // 1. Fetch the recovery_key_envelope and crypto params for this token
      const { mek_salt, argon2_params, recovery_key_envelope } = await api.recoverValidate(token);

      // 2. Unwrap MEK using the recovery key mnemonic
      const mek = await unwrapMEKWithRecoveryKey(recovery_key_envelope, mnemonic);

      // 3. Derive new KEK from the new password, re-wrap the MEK
      const params: Argon2Params = JSON.parse(argon2_params);
      const newKek = await deriveKEK(data.password, mek_salt, params);
      const newMEKEnvelope = await wrapMEK(mek, newKek);

      // 4. Submit new password + re-wrapped MEK envelope to server
      await api.recoverComplete(token, data.password, newMEKEnvelope);

      setDone(true);
    } catch (err) {
      if (err instanceof APIError) {
        toast({ title: err.message, variant: "destructive" });
      } else {
        toast({
          title: "Recovery failed. Check your recovery key and try again.",
          variant: "destructive",
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (done) {
    return (
      <div className="text-center space-y-4">
        <div className="h-12 w-12 rounded-full bg-success-50 flex items-center justify-center mx-auto">
          <CheckCircle2 className="h-6 w-6 text-success-700" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Account recovered</h1>
          <p className="text-sm text-text-secondary mt-2">
            Your password has been updated. Sign in with your new password to access your vaults.
          </p>
        </div>
        <Button className="w-full" onClick={() => router.push("/login")}>
          Sign in
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2 mb-1">
        <KeyRound className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-semibold text-text-primary">Enter your recovery key</h1>
      </div>
      <p className="text-sm text-text-secondary mb-6">
        Enter your 24-word recovery key and choose a new password. Your vault data will remain intact.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">
            24-word recovery key
          </label>
          <textarea
            className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm font-mono
                       focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            rows={4}
            placeholder="word1 word2 word3 ... word24"
            spellCheck={false}
            autoComplete="off"
            {...register("mnemonic")}
          />
          {errors.mnemonic && (
            <p className="mt-1 text-xs text-destructive">{errors.mnemonic.message}</p>
          )}
        </div>

        <div>
          <PasswordInput
            label="New password"
            autoComplete="new-password"
            hint="At least 12 characters"
            error={errors.password?.message}
            {...register("password")}
          />
          <PasswordStrengthMeter value={passwordValue} />
        </div>

        <PasswordInput
          label="Confirm new password"
          autoComplete="new-password"
          error={errors.password_confirm?.message}
          {...register("password_confirm")}
        />

        <Button type="submit" loading={isLoading} className="w-full mt-2">
          Recover account
        </Button>
      </form>
    </>
  );
}
