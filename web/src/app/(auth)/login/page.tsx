"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CheckCircle2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, PasswordInput } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { api, APIError } from "@/lib/api";
import {
  deriveKEK,
  unwrapMEK,
  storeMEK,
  storeCryptoSession,
} from "@/lib/crypto";
import type { Argon2Params } from "@/types";
import { useAuthStore } from "@/store/auth";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
  mfa_code: z.string().optional(),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setAuth } = useAuthStore();
  const [mfaRequired, setMfaRequired] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resendSent, setResendSent] = useState(false);

  const justVerified = searchParams.get("verified") === "true";

  // Prevent mobile browsers from auto-focusing the first input on navigation
  useEffect(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }, []);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true);
    try {
      const result = await api.login({
        email: data.email,
        password: data.password,
        mfa_code: data.mfa_code,
      });

      // Derive KEK from password + server-supplied mek_salt, then unwrap MEK from envelope
      const params: Argon2Params = JSON.parse(result.argon2_params);
      const kek = await deriveKEK(data.password, result.mek_salt, params);
      const mek = await unwrapMEK(result.mek_envelope, kek);
      storeMEK(mek);
      storeCryptoSession(result.mek_envelope, result.mek_salt, result.argon2_params);

      setAuth(result.user, result.access_token);
      router.push(searchParams.get("return") ?? "/dashboard");
    } catch (err) {
      if (err instanceof APIError) {
        if (err.code === "mfa_required") {
          setMfaRequired(true);
          return;
        }
        if (err.code === "email_not_verified") {
          setUnverifiedEmail(data.email);
          return;
        }
      }
      const msg = err instanceof APIError
        ? err.message
        : err instanceof Error
        ? err.message
        : "Something went wrong. Please try again.";
      toast({ title: msg, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (!unverifiedEmail) return;
    try {
      await api.resendVerification(unverifiedEmail);
      setResendSent(true);
    } catch {
      toast({ title: "Failed to resend. Please try again.", variant: "destructive" });
    }
  };

  if (unverifiedEmail) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-50 border border-amber-200">
          <Mail className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-900">Email not verified</p>
            <p className="text-sm text-amber-700 mt-0.5">
              You need to verify your email before signing in. Check your inbox for a verification link.
            </p>
          </div>
        </div>
        {resendSent ? (
          <p className="text-sm text-text-secondary text-center">
            A new verification link has been sent to <strong>{unverifiedEmail}</strong>.
          </p>
        ) : (
          <Button variant="outline" className="w-full" onClick={handleResend}>
            Resend verification email
          </Button>
        )}
        <button
          className="w-full text-sm text-text-muted hover:text-text-secondary underline underline-offset-2"
          onClick={() => setUnverifiedEmail(null)}
        >
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <>
      {justVerified && (
        <div className="flex items-center gap-2.5 p-3 rounded-lg bg-success-50 border border-success-200 mb-5">
          <CheckCircle2 className="h-4 w-4 text-success-600 flex-shrink-0" />
          <p className="text-sm text-success-700">Email verified — you can now sign in.</p>
        </div>
      )}
      {searchParams.get("reason") === "inactivity" && (
        <div className="flex items-center gap-2.5 p-3 rounded-lg bg-surface-muted border border-border mb-5">
          <p className="text-sm text-text-secondary">You were signed out due to inactivity. Please sign in again.</p>
        </div>
      )}

      <h1 className="text-xl font-semibold text-text-primary mb-1">
        {mfaRequired ? "Two-factor authentication" : "Welcome back"}
      </h1>
      <p className="text-sm text-text-secondary mb-6">
        {mfaRequired
          ? "Enter the code from your authenticator app"
          : "Sign in to your vault"}
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        {!mfaRequired ? (
          <>
            <Input
              label="Email address"
              type="email"
              autoComplete="email"
              error={errors.email?.message}
              {...register("email")}
            />
            <PasswordInput
              label="Password"
              autoComplete="current-password"
              error={errors.password?.message}
              {...register("password")}
            />
            <div className="flex justify-end">
              <Link
                href="/forgot-password"
                className="text-xs text-primary hover:underline"
              >
                Forgot your password?
              </Link>
            </div>
          </>
        ) : (
          <Input
            label="Authentication code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            maxLength={6}
            error={errors.mfa_code?.message}
            {...register("mfa_code")}
          />
        )}

        <Button type="submit" loading={isLoading} className="w-full mt-2">
          {mfaRequired ? "Verify" : "Sign in"}
        </Button>
      </form>

      {!mfaRequired && (
        <p className="mt-5 text-center text-sm text-text-secondary">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="text-primary font-medium hover:underline">
            Create one
          </Link>
        </p>
      )}
    </>
  );
}
