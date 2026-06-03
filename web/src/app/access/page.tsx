"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, APIError } from "@/lib/api";
import { AlertCircle, CheckCircle2, ShieldEllipsis, Vault, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Image from "next/image";
import Link from "next/link";

type PortalInfo = Awaited<ReturnType<typeof api.getBeneficiaryPortal>>;

function AccessContent() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const { data: branding } = useQuery({
    queryKey: ["branding"],
    queryFn: () => api.getBranding(),
    staleTime: Infinity,
  });
  const appName = branding?.app_name || "P.S. Vault";

  type Step = "email" | "sent" | "loading_token" | "portal" | "error";
  const [step, setStep] = useState<Step>(token ? "loading_token" : "email");
  const [email, setEmail] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [portal, setPortal] = useState<PortalInfo | null>(null);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const info = await api.getBeneficiaryPortal(token);
        setPortal(info);
        setStep("portal");
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
      await api.initiateBeneficiaryAccess(email.trim());
      setStep("sent");
    } catch (err) {
      setErrorMsg(err instanceof APIError ? err.message : "Something went wrong. Please try again.");
      setStep("error");
    }
  }

  const isPortal = step === "portal";
  const isError = step === "error";
  const isDone = false;

  const iconBg = isError
    ? "bg-destructive/10"
    : isPortal
    ? "bg-blue-50"
    : "bg-blue-50";

  const icon = isError
    ? <AlertCircle className="w-5 h-5 text-destructive" />
    : isPortal
    ? <CheckCircle2 className="w-5 h-5 text-blue-600" />
    : <Vault className="w-5 h-5 text-blue-600" />;

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
          <div className={`w-9 h-9 rounded-full ${iconBg} flex items-center justify-center flex-shrink-0`}>
            {icon}
          </div>
          <div>
            <h1 className="text-lg font-semibold text-text-primary">
              {isPortal ? `Welcome, ${portal?.beneficiary_name}` : "Check your beneficiary status"}
            </h1>
            <p className="text-xs text-text-muted">Beneficiary portal</p>
          </div>
        </div>

        {step === "email" && (
          <>
            <p className="text-sm text-text-secondary leading-relaxed">
              If you have been listed as a beneficiary, enter your email address to see which
              vaults you have been assigned to and verify your status.
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
              <Button type="submit" className="w-full bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 dark:bg-green-950/30 dark:hover:bg-green-950/50 dark:text-green-400 dark:border-green-700/50">
                Send access link
              </Button>
            </form>
          </>
        )}

        {step === "sent" && (
          <div className="space-y-2">
            <h2 className="text-base font-semibold text-text-primary">Check your inbox</h2>
            <p className="text-sm text-text-secondary leading-relaxed">
              If your email is registered as a beneficiary, you&apos;ll receive a secure link to view your status.
              The link expires in 30 minutes and can only be used once.
            </p>
          </div>
        )}

        {step === "loading_token" && (
          <p className="text-sm text-text-secondary">Verifying link…</p>
        )}

        {step === "portal" && portal && (
          <div className="space-y-4">
            <p className="text-sm text-text-secondary leading-relaxed">
              You are listed as a beneficiary for the following {portal.owners.length === 1 ? "person" : "people"}.
              Vault contents are not accessible until the vault owner&apos;s switch triggers.
            </p>

            <div className="space-y-3">
              {portal.owners.map((owner) => (
                <div
                  key={owner.beneficiary_id}
                  className="rounded-lg border border-border bg-background p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-text-primary">{owner.owner_display_name}</p>
                      <p className="text-xs text-text-muted mt-0.5">
                        {owner.vault_count} vault{owner.vault_count !== 1 ? "s" : ""} assigned
                      </p>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      owner.email_confirmed
                        ? "bg-green-50 text-green-700"
                        : "bg-amber-50 text-amber-700"
                    }`}>
                      {owner.email_confirmed ? "Confirmed" : "Pending confirmation"}
                    </span>
                  </div>

                  <Link href="/report">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-1.5 text-amber-700 border-amber-200 hover:bg-amber-50"
                    >
                      <Heart className="h-3.5 w-3.5" />
                      Report a passing
                    </Button>
                  </Link>
                </div>
              ))}
            </div>

            {portal.owners.length === 0 && (
              <p className="text-sm text-text-muted text-center py-4">
                No vault assignments found for this email.
              </p>
            )}
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

export default function AccessPage() {
  return (
    <Suspense>
      <AccessContent />
    </Suspense>
  );
}
