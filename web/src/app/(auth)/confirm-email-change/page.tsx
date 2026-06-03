"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { CheckCircle2, XCircle, Loader2, ShieldEllipsis } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export default function ConfirmEmailChangePage() {
  return (
    <Suspense>
      <ConfirmEmailChangeContent />
    </Suspense>
  );
}

function ConfirmEmailChangeContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const { data: branding } = useQuery({
    queryKey: ["branding"],
    queryFn: () => api.getBranding(),
    staleTime: Infinity,
  });
  const appName = branding?.app_name || "P.S. Vault";
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      return;
    }
    api.confirmEmailChange(token)
      .then(() => setStatus("success"))
      .catch(() => setStatus("error"));
  }, [token]);

  return (
    <div className="w-full max-w-md bg-surface rounded-xl shadow-dialog border border-border p-8 text-center space-y-4">
      <div className="flex justify-center mb-2">
        <ShieldEllipsis className="h-8 w-8 text-primary" />
      </div>
      <p className="text-xs font-semibold tracking-widest text-text-muted uppercase">{appName}</p>

      {status === "loading" && (
        <>
          <Loader2 className="h-10 w-10 text-primary animate-spin mx-auto" />
          <p className="text-sm text-text-secondary">Confirming your new email address…</p>
        </>
      )}

      {status === "success" && (
        <>
          <CheckCircle2 className="h-12 w-12 text-success-600 mx-auto" />
          <h1 className="text-xl font-semibold text-text-primary">Email address updated</h1>
          <p className="text-sm text-text-secondary">
            Your email has been changed successfully. Use your new address to sign in going forward.
          </p>
          <Button asChild className="w-full mt-2">
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
        </>
      )}

      {status === "error" && (
        <>
          <XCircle className="h-12 w-12 text-destructive mx-auto" />
          <h1 className="text-xl font-semibold text-text-primary">Link invalid or expired</h1>
          <p className="text-sm text-text-secondary">
            This confirmation link has already been used or has expired. You can request a new one from your account settings.
          </p>
          <Button asChild variant="outline" className="w-full mt-2">
            <Link href="/settings">Back to settings</Link>
          </Button>
        </>
      )}
    </div>
  );
}
