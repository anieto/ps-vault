"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { CheckCircle2, XCircle, Loader2, ShieldEllipsis } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export default function CheckInPage() {
  return (
    <Suspense>
      <CheckInContent />
    </Suspense>
  );
}

function CheckInContent() {
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

    const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api/v1";
    fetch(`${BASE_URL}/switch/checkin/email?token=${encodeURIComponent(token)}`)
      .then((res) => {
        if (res.ok) setStatus("success");
        else setStatus("error");
      })
      .catch(() => setStatus("error"));
  }, [token]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: "linear-gradient(160deg, #eff6ff 0%, #f5f9ff 25%, #F9F8F6 55%)" }}
    >
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-border p-8 text-center space-y-4">
        <div className="flex justify-center mb-2">
          <ShieldEllipsis className="h-8 w-8 text-primary" />
        </div>
        <p className="text-xs font-semibold tracking-widest text-text-muted uppercase">{appName}</p>

        {status === "loading" && (
          <>
            <Loader2 className="h-10 w-10 text-primary animate-spin mx-auto" />
            <p className="text-sm text-text-secondary">Verifying your check-in link…</p>
          </>
        )}

        {status === "success" && (
          <>
            <CheckCircle2 className="h-12 w-12 text-success-600 mx-auto" />
            <h1 className="text-xl font-semibold text-text-primary">You&apos;re checked in</h1>
            <p className="text-sm text-text-secondary">
              Your timer has been reset. We&apos;ll reach out again when your next check-in is due.
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
              This check-in link has already been used or has expired. You can check in directly from your dashboard.
            </p>
            <Button asChild variant="outline" className="w-full mt-2">
              <Link href="/dashboard">Go to dashboard</Link>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
