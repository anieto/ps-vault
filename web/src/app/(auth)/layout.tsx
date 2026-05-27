"use client";

import { useQuery } from "@tanstack/react-query";
import { ShieldEllipsis } from "lucide-react";
import { api } from "@/lib/api";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: branding } = useQuery({
    queryKey: ["branding"],
    queryFn: () => api.getBranding(),
    staleTime: Infinity,
  });
  const appName = branding?.app_name || "P.S. Vault";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4" style={{ background: "linear-gradient(160deg, #eff6ff 0%, #f5f9ff 25%, #F9F8F6 55%)" }}>
      {/* Logo */}
      <div className="mb-8 flex flex-col items-center gap-2">
        {branding?.app_name ? (
          <div className="flex items-center gap-2.5">
            <ShieldEllipsis className="h-6 w-6 text-primary" aria-hidden />
            <span className="text-xl font-semibold text-text-primary">{appName}</span>
          </div>
        ) : (
          <img src="/logo.png" alt="P.S. Vault" className="h-16 w-16 rounded-xl" />
        )}
        <span className="text-2xl font-semibold text-text-primary">{appName}</span>
        <p className="text-sm text-text-muted">Your final message, safely delivered.</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-md bg-surface rounded-xl shadow-dialog border border-border p-8">
        {children}
      </div>

      {/* Disclaimer */}
      <p className="mt-6 max-w-md text-center text-xs text-text-muted leading-relaxed">
        {appName} is a personal tool for sharing information with loved ones.
        It is not a substitute for a legal will or estate plan.
      </p>

      {/* Attribution */}
      <p className="mt-3 text-xs text-text-muted/60">
        Powered by{" "}
        <a
          href="https://github.com/anieto/ps-vault"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-text-muted transition-colors"
        >
          P.S. Vault
        </a>
      </p>
    </div>
  );
}
