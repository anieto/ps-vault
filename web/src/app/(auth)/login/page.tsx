"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CheckCircle2, Fingerprint, KeyRound, Mail } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { startAuthentication } from "@simplewebauthn/browser";
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
import type { Argon2Params, AuthResponse } from "@/types";
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

type LoginStep = "credentials" | "passkey" | "totp";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setAuth } = useAuthStore();
  const [step, setStep] = useState<LoginStep>("credentials");
  // mfaRequired kept as alias for step === "totp" to minimise diff below
  const mfaRequired = step === "totp";
  const [isLoading, setIsLoading] = useState(false);
  const [passkeyChallenge, setPasskeyChallenge] = useState<{
    id: string;
    options: Record<string, unknown>;
  } | null>(null);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [savedEmail, setSavedEmail] = useState("");
  const [savedPassword, setSavedPassword] = useState("");
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resendSent, setResendSent] = useState(false);
  const [showAccessRequest, setShowAccessRequest] = useState(false);
  const [accessReqName, setAccessReqName] = useState("");
  const [accessReqEmail, setAccessReqEmail] = useState("");
  const [accessReqMessage, setAccessReqMessage] = useState("");
  const [accessReqSent, setAccessReqSent] = useState(false);
  const [accessReqLoading, setAccessReqLoading] = useState(false);

  const { data: branding } = useQuery({
    queryKey: ["branding"],
    queryFn: () => api.getBranding(),
    staleTime: Infinity,
  });
  const regMode = branding?.registration_mode ?? "invite";

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

  const completeLogin = useCallback(async (result: AuthResponse, password: string) => {
    const params: Argon2Params = JSON.parse(result.argon2_params);
    const kek = await deriveKEK(password, result.mek_salt, params);
    const mek = await unwrapMEK(result.mek_envelope, kek);
    storeMEK(mek);
    storeCryptoSession(result.mek_envelope, result.mek_salt, result.argon2_params);
    setAuth(result.user, result.access_token);
    const raw = searchParams.get("return") ?? "/dashboard";
    const returnTo = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/dashboard";
    router.push(returnTo);
  }, [router, searchParams, setAuth]);

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true);
    try {
      // TOTP path: user already sees the code input
      if (step === "totp") {
        const result = await api.login({
          email: savedEmail,
          password: savedPassword,
          mfa_code: data.mfa_code,
        });
        await completeLogin(result, savedPassword);
        return;
      }

      // Credentials path: try login, then check for passkeys if MFA is required
      const result = await api.login({
        email: data.email,
        password: data.password,
      });
      await completeLogin(result, data.password);
    } catch (err) {
      if (err instanceof APIError) {
        if (err.code === "mfa_required") {
          // Try passkey begin — falls back to TOTP on any error
          setSavedEmail(data.email);
          setSavedPassword(data.password);
          try {
            const begun = await api.passkeyBeginAuthentication({
              email: data.email,
              password: data.password,
            });
            setPasskeyChallenge({ id: begun.challenge_id, options: begun.assertion_options.publicKey });
            setStep("passkey");
          } catch {
            setStep("totp");
          }
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

  const handlePasskeyAssert = async () => {
    if (!passkeyChallenge) return;
    setPasskeyLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const assertion = await startAuthentication({ optionsJSON: passkeyChallenge.options as any });
      const result = await api.passkeyFinishAuthentication(passkeyChallenge.id, assertion as Record<string, unknown>);
      await completeLogin(result, savedPassword);
    } catch (err) {
      if (err instanceof Error && err.name === "NotAllowedError") {
        // User cancelled — stay on passkey step
        return;
      }
      const msg = err instanceof APIError ? err.message : "Passkey verification failed. Try using a code instead.";
      toast({ title: msg, variant: "destructive" });
    } finally {
      setPasskeyLoading(false);
    }
  };

  const handleAccessRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setAccessReqLoading(true);
    try {
      await api.submitAccessRequest(accessReqName, accessReqEmail, accessReqMessage);
      setAccessReqSent(true);
    } catch {
      toast({ title: "Failed to send request. Please try again.", variant: "destructive" });
    } finally {
      setAccessReqLoading(false);
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
        {step === "passkey" ? "Use your passkey" : mfaRequired ? "Two-factor authentication" : "Welcome back"}
      </h1>
      <p className="text-sm text-text-secondary mb-6">
        {step === "passkey"
          ? "Authenticate with your device passkey"
          : mfaRequired
          ? "Enter the code from your authenticator app"
          : "Sign in to your vault"}
      </p>

      {step === "passkey" ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="rounded-full bg-primary/10 p-4">
              <Fingerprint className="h-8 w-8 text-primary" />
            </div>
            <p className="text-sm text-text-secondary text-center">
              Use your device passkey (Face ID, Touch ID, or security key) to sign in.
            </p>
          </div>
          <Button onClick={handlePasskeyAssert} loading={passkeyLoading} className="w-full">
            Use passkey
          </Button>
          <button
            type="button"
            onClick={() => { setStep("totp"); setPasskeyChallenge(null); }}
            className="flex items-center justify-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
          >
            <KeyRound className="h-3.5 w-3.5" />
            Use authentication code instead
          </button>
        </div>
      ) : (
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
      )}

      {step === "credentials" && (
        <>
          {regMode !== "closed" && (
            <>
              {regMode === "open" ? (
                <p className="mt-5 text-center text-sm text-text-secondary">
                  Don&apos;t have an account?{" "}
                  <Link href="/register" className="text-primary font-medium hover:underline">
                    Create one
                  </Link>
                </p>
              ) : (
                /* invite mode */
                <div className="mt-5">
                  {!showAccessRequest ? (
                    <p className="text-center text-sm text-text-secondary">
                      Don&apos;t have an account?{" "}
                      <button
                        className="text-primary font-medium hover:underline"
                        onClick={() => setShowAccessRequest(true)}
                      >
                        Request access
                      </button>
                    </p>
                  ) : accessReqSent ? (
                    <div className="space-y-2 p-4 rounded-lg bg-green-50 border border-green-200 dark:bg-green-950/30 dark:border-green-700/50">
                      <p className="text-sm font-medium text-green-800 dark:text-green-300">Request sent</p>
                      <p className="text-sm text-green-700 dark:text-green-400">
                        The admin has been notified. They&apos;ll reach out if your request is approved.
                      </p>
                    </div>
                  ) : (
                    <form onSubmit={handleAccessRequest} className="space-y-3">
                      <p className="text-sm text-text-secondary">Request an account — the admin will review and reach out.</p>
                      <Input
                        label="Your name"
                        value={accessReqName}
                        onChange={(e) => setAccessReqName(e.target.value)}
                        placeholder="Jane Smith"
                        required
                      />
                      <Input
                        label="Your email"
                        type="email"
                        value={accessReqEmail}
                        onChange={(e) => setAccessReqEmail(e.target.value)}
                        placeholder="you@example.com"
                        required
                      />
                      <div className="space-y-1.5">
                        <label className="block text-sm font-medium text-text-primary">Message (optional)</label>
                        <textarea
                          value={accessReqMessage}
                          onChange={(e) => setAccessReqMessage(e.target.value)}
                          rows={2}
                          placeholder="Why you&apos;re requesting access…"
                          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button type="button" variant="outline" size="sm" className="flex-1" onClick={() => setShowAccessRequest(false)}>
                          Cancel
                        </Button>
                        <Button type="submit" size="sm" className="flex-1" loading={accessReqLoading}>
                          Send request
                        </Button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </>
          )}
          <div className="mt-4 flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-text-muted">or</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          <div className="mt-3 flex flex-col items-center gap-2">
            <p className="text-sm text-text-secondary">Are you a beneficiary?</p>
            <Button asChild size="sm" className="w-full bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 dark:bg-green-950/30 dark:hover:bg-green-950/50 dark:text-green-400 dark:border-green-700/50">
              <Link href="/access">Check my access</Link>
            </Button>
            <Button asChild size="sm" className="w-full bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 dark:bg-rose-950/30 dark:hover:bg-rose-950/50 dark:text-rose-400 dark:border-rose-700/50">
              <Link href="/report">Report a passing</Link>
            </Button>
          </div>
        </>
      )}
    </>
  );
}
