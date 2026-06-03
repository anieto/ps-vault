"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, APIError } from "@/lib/api";
import { CheckCircle2, AlertCircle, ShieldCheck, ShieldEllipsis } from "lucide-react";
import Image from "next/image";

function VerifyContent() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const { data: branding } = useQuery({
    queryKey: ["branding"],
    queryFn: () => api.getBranding(),
    staleTime: Infinity,
  });
  const appName = branding?.app_name || "P.S. Vault";

  const [state, setState] = useState<"loading" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!token) {
      setErrorMsg("No token found in this link. Please check the email and try again.");
      setState("error");
      return;
    }
    (async () => {
      try {
        await api.verifyLife(token);
        setState("success");
      } catch (err) {
        setErrorMsg(err instanceof APIError ? err.message : "This link is invalid or has already been used.");
        setState("error");
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const icon = state === "success"
    ? <CheckCircle2 className="w-5 h-5 text-green-600" />
    : state === "error"
    ? <AlertCircle className="w-5 h-5 text-destructive" />
    : <ShieldCheck className="w-5 h-5 text-primary" />;

  const iconBg = state === "success" ? "bg-green-100" : state === "error" ? "bg-red-100" : "bg-primary/10";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 py-12 gradient-app overflow-y-auto">
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

      <div className="w-full max-w-md bg-surface rounded-xl shadow-dialog border border-border p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${iconBg}`}>
            {icon}
          </div>
          <div>
            <h1 className="text-lg font-semibold text-text-primary">
              {state === "loading" ? "Confirming…" : state === "success" ? "You're confirmed as okay" : "Link unavailable"}
            </h1>
            <p className="text-xs text-text-muted">Death report response</p>
          </div>
        </div>

        {state === "loading" && (
          <p className="text-sm text-text-secondary">Please wait.</p>
        )}

        {state === "success" && (
          <div className="space-y-2">
            <p className="text-sm text-text-secondary leading-relaxed">
              The death report has been dismissed and the reporter has been notified that you are okay.
              Your check-in timer has been reset.
            </p>
            <p className="text-sm text-text-muted">You can close this tab.</p>
          </div>
        )}

        {state === "error" && (
          <div className="space-y-2">
            <p className="text-sm text-text-secondary leading-relaxed">{errorMsg}</p>
            <p className="text-sm text-text-muted">
              This can happen if the link has already been used or has expired.
              Sign in to your account to manage any active reports.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense>
      <VerifyContent />
    </Suspense>
  );
}
