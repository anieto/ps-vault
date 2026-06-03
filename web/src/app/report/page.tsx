"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, APIError } from "@/lib/api";
import { AlertCircle, CheckCircle2, Heart, ShieldEllipsis } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Image from "next/image";

function ReportContent() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const { data: branding } = useQuery({
    queryKey: ["branding"],
    queryFn: () => api.getBranding(),
    staleTime: Infinity,
  });
  const appName = branding?.app_name || "P.S. Vault";

  type Step = "email" | "loading_token" | "confirm" | "submitting" | "done" | "error" | "sent";
  const [step, setStep] = useState<Step>(token ? "loading_token" : "email");
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [dateOfPassing, setDateOfPassing] = useState("");
  const [notes, setNotes] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [activeToken, setActiveToken] = useState(token);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await api.validateDeathReportToken(token);
        setOwnerName(res.owner_name);
        setActiveToken(token);
        setStep("confirm");
      } catch {
        setErrorMsg("This link is invalid or has expired. Please request a new one.");
        setStep("error");
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    try {
      await api.initiateDeathReport(email.trim());
      setStep("sent");
    } catch (err) {
      setErrorMsg(err instanceof APIError ? err.message : "Something went wrong. Please try again.");
      setStep("error");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStep("submitting");
    try {
      await api.submitDeathReport({
        token: activeToken,
        date_of_passing: dateOfPassing || undefined,
        notes: notes || undefined,
      });
      setStep("done");
    } catch (err) {
      setErrorMsg(err instanceof APIError ? err.message : "Something went wrong. Please try again.");
      setStep("error");
    }
  }

  const icon = step === "done"
    ? <CheckCircle2 className="w-5 h-5 text-green-600" />
    : step === "error"
    ? <AlertCircle className="w-5 h-5 text-destructive" />
    : <Heart className="w-5 h-5 text-amber-600" />;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 py-12 gradient-app overflow-y-auto">
      {/* Header */}
      <div className="mb-8 flex flex-col items-center gap-2">
        {branding?.app_name ? (
          <div className="flex items-center gap-2.5">
            <ShieldEllipsis className="h-6 w-6 text-primary" aria-hidden />
            <span className="text-xl font-semibold text-text-primary">{appName}</span>
          </div>
        ) : (
          <>
            <Image src="/logo.png" alt="P.S. Vault" width={80} height={80} className="rounded-xl ring-2 ring-accent-600/60" />
            <span className="text-3xl font-semibold text-text-primary">P.S. Vault</span>
          </>
        )}
        <p className="text-base text-text-muted">Your final message, safely delivered.</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-md bg-surface rounded-xl shadow-dialog border border-border p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
            {icon}
          </div>
          <div>
            <h1 className="text-lg font-semibold text-text-primary">Report a passing</h1>
            <p className="text-xs text-text-muted">Beneficiary portal</p>
          </div>
        </div>

        {step === "email" && (
          <>
            <p className="text-sm text-text-secondary leading-relaxed">
              If you are a listed beneficiary and need to report that the vault owner has passed away,
              enter your email address below. We&apos;ll send you a secure link to continue.
            </p>
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <Input
                label="Your email address"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
              <Button type="submit" className="w-full bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 dark:bg-rose-950/30 dark:hover:bg-rose-950/50 dark:text-rose-400 dark:border-rose-700/50">
                Send verification link
              </Button>
            </form>
          </>
        )}

        {step === "sent" && (
          <div className="space-y-2">
            <h2 className="text-base font-semibold text-text-primary">Check your inbox</h2>
            <p className="text-sm text-text-secondary leading-relaxed">
              If your email is registered as a beneficiary, you&apos;ll receive a secure link to continue.
              The link expires in 30 minutes.
            </p>
          </div>
        )}

        {step === "loading_token" && (
          <div className="space-y-2">
            <p className="text-sm text-text-secondary">Verifying link…</p>
          </div>
        )}

        {step === "confirm" && (
          <>
            <p className="text-sm text-text-secondary leading-relaxed">
              You are about to report the passing of <strong>{ownerName}</strong>.
              The vault owner will be immediately notified and given a window to respond.
              If they do not respond in time, vault access will be granted.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Date of passing (optional)"
                type="date"
                value={dateOfPassing}
                onChange={(e) => setDateOfPassing(e.target.value)}
              />
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-text-primary">
                  Additional notes (optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Any context you'd like to provide…"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                />
              </div>
              <p className="text-xs text-text-muted">
                This action will send an urgent alert to the vault owner. Please only submit this if
                you are certain of the passing.
              </p>
              <Button type="submit" className="w-full bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 dark:bg-rose-950/30 dark:hover:bg-rose-950/50 dark:text-rose-400 dark:border-rose-700/50">
                Submit report
              </Button>
            </form>
          </>
        )}

        {step === "submitting" && (
          <p className="text-sm text-text-secondary">Submitting…</p>
        )}

        {step === "done" && (
          <div className="space-y-2">
            <h2 className="text-base font-semibold text-text-primary">Report submitted</h2>
            <p className="text-sm text-text-secondary leading-relaxed">
              The vault owner has been notified and has a window to respond and confirm they are okay.
              If they do not respond in time, you will receive access to the vaults assigned to you.
            </p>
          </div>
        )}

        {step === "error" && (
          <div className="space-y-4">
            <p className="text-sm text-text-secondary leading-relaxed">{errorMsg}</p>
            <Button variant="outline" className="w-full" onClick={() => setStep("email")}>
              Start over
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ReportPage() {
  return (
    <Suspense>
      <ReportContent />
    </Suspense>
  );
}
