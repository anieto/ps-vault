"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  CheckCircle2,
  Clock,
  LockKeyhole as VaultIcon,
  Users,
  AlertTriangle,
  PauseCircle,
  ChevronRight,
  Plus,
  KeyRound,
  ShieldCheck,
  X,
} from "lucide-react";
import { api, APIError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRelativeDate as formatRelative, formatDate, getDaysUntil, getHoursUntil, formatDeadlineCountdown } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";
import type { SwitchSettings, Vault } from "@/types";
import { useState, useEffect } from "react";

export default function DashboardPage() {
  const { user } = useAuthStore();

  const { data: switchData } = useQuery({
    queryKey: ["switch"],
    queryFn: () => api.getSwitch(),
  });

  const { data: vaultsData } = useQuery({
    queryKey: ["vaults"],
    queryFn: () => api.listVaults(),
  });

  const { data: beneficiariesData } = useQuery({
    queryKey: ["beneficiaries"],
    queryFn: () => api.listBeneficiaries(),
  });

  const vaultsLoaded = (vaultsData as Vault[] | undefined) ?? [];

  const { data: vaultAccessData } = useQuery({
    queryKey: ["vault-access-check"],
    queryFn: async () => {
      const results = await Promise.all(vaultsLoaded.map((v) => api.getVaultBeneficiaries(v.id)));
      return results.some((r) => r.length > 0);
    },
    enabled: vaultsLoaded.length > 0,
  });

  const sw = switchData as SwitchSettings | undefined;
  const vaults = vaultsLoaded;
  const beneficiaries = (beneficiariesData as Array<{ id: string }> | undefined) ?? [];

  const [showChecklist, setShowChecklist] = useState(false);

  const setupSteps = [
    {
      id: "vault",
      label: "Create your first vault",
      done: vaults.length > 0,
      href: "/vaults",
      cta: "Create vault",
    },
    {
      id: "beneficiary",
      label: "Add a beneficiary",
      done: beneficiaries.length > 0,
      href: "/beneficiaries",
      cta: "Add beneficiary",
    },
    {
      id: "access",
      label: "Grant vault access to a beneficiary",
      done: vaultAccessData === true,
      href: "/vaults",
      cta: "Grant access",
    },
    {
      id: "switch",
      label: "Activate your switch",
      done: !!sw && sw.status !== "inactive",
      href: "/settings",
      cta: "Set up switch",
    },
  ];

  const allDone = setupSteps.every((s) => s.done);

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">
          Welcome back{user?.display_name ? `, ${user.display_name.split(" ")[0]}` : ""}.
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          {allDone
            ? "Everything looks good. Your vault is ready."
            : "Let's get your vault set up."}
        </p>
      </div>

      {/* Security nudges */}
      <SecurityNudges />

      {/* Setup checklist */}
      {(!allDone || showChecklist) && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Getting started</CardTitle>
            {showChecklist && allDone && (
              <button
                onClick={() => setShowChecklist(false)}
                className="text-xs text-text-muted hover:text-text-secondary underline underline-offset-2"
              >
                Dismiss
              </button>
            )}
          </CardHeader>
          <CardContent className="divide-y divide-border">
            {setupSteps.map((step) => (
              <div key={step.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                <div className="flex items-center gap-3">
                  {step.done ? (
                    <CheckCircle2 className="h-5 w-5 text-success-600 flex-shrink-0" />
                  ) : (
                    <div className="h-5 w-5 rounded-full border-2 border-border flex-shrink-0" />
                  )}
                  <span className={step.done ? "text-sm text-text-muted line-through" : "text-sm text-text-primary"}>
                    {step.label}
                  </span>
                </div>
                {!step.done && (
                  <Button asChild size="sm" variant="outline">
                    <Link href={step.href}>{step.cta}</Link>
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Switch status card */}
      <SwitchStatusCard sw={sw} />

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard
          label="Vaults"
          value={vaults.length}
          icon={<VaultIcon className="h-4 w-4" />}
          href="/vaults"
        />
        <StatCard
          label="Beneficiaries"
          value={beneficiaries.length}
          icon={<Users className="h-4 w-4" />}
          href="/beneficiaries"
        />
        <StatCard
          label="Last check-in"
          value={sw?.last_checkin_at ? formatRelative(sw.last_checkin_at) : "Never"}
          icon={<Clock className="h-4 w-4" />}
          href="/settings"
          small
        />
      </div>

      {/* Recent vaults */}
      {vaults.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wide">
              Your vaults
            </h2>
            <Button asChild variant="ghost" size="sm" className="gap-1">
              <Link href="/vaults">
                View all <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
          <div className="space-y-2">
            {vaults.slice(0, 3).map((vault) => (
              <VaultRow key={vault.id} vault={vault} />
            ))}
          </div>
        </div>
      )}

      {/* Review setup prompt (shown when all steps complete and checklist is hidden) */}
      {allDone && !showChecklist && (
        <div className="flex items-center justify-between px-4 py-3 rounded-lg border border-border bg-surface">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="h-4 w-4 text-success-600 flex-shrink-0" />
            <span className="text-sm text-text-secondary">Setup complete</span>
          </div>
          <button
            onClick={() => setShowChecklist(true)}
            className="text-xs text-text-muted hover:text-text-secondary underline underline-offset-2"
          >
            Review setup
          </button>
        </div>
      )}

      {vaults.length === 0 && allDone === false && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-10 gap-3">
            <VaultIcon className="h-8 w-8 text-text-muted" />
            <p className="text-sm text-text-secondary text-center">
              No vaults yet. Create your first vault to get started.
            </p>
            <Button asChild size="sm">
              <Link href="/vaults">
                <Plus className="h-4 w-4 mr-1.5" />
                Create vault
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SecurityNudges() {
  const { user } = useAuthStore();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("psvault_nudge_dismissed") ?? "[]");
      setDismissed(new Set(stored));
    } catch { /* ignore */ }
  }, []);

  const dismiss = (key: string) => {
    setDismissed((prev) => {
      const next = new Set(prev).add(key);
      localStorage.setItem("psvault_nudge_dismissed", JSON.stringify([...next]));
      return next;
    });
  };

  if (!user) return null;

  const nudges = [
    !user.has_recovery_key && !dismissed.has("recovery_key") && {
      key: "recovery_key",
      icon: <KeyRound className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />,
      title: "Set up your recovery key",
      body: "Without a recovery key, a forgotten password means permanent loss of access to your vaults.",
      cta: "Set up",
      href: "/settings#security",
    },
    !user.mfa_enabled && !dismissed.has("mfa") && {
      key: "mfa",
      icon: <ShieldCheck className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />,
      title: "Enable two-factor authentication",
      body: "Add an extra layer of security to protect your account from unauthorized access.",
      cta: "Enable",
      href: "/settings#security",
    },
  ].filter(Boolean) as { key: string; icon: React.ReactNode; title: string; body: string; cta: string; href: string }[];

  if (nudges.length === 0) return null;

  return (
    <div className="space-y-2">
      {nudges.map((nudge) => (
        <div key={nudge.key} className="flex items-start gap-3 px-4 py-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700/50">
          {nudge.icon}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-300">{nudge.title}</p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">{nudge.body}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button asChild size="sm" variant="outline" className="border-amber-300 text-amber-800 hover:bg-amber-100 dark:border-amber-700/50 dark:text-amber-400 dark:hover:bg-amber-950/50 h-7 text-xs">
              <Link href={nudge.href}>{nudge.cta}</Link>
            </Button>
            <button
              onClick={() => dismiss(nudge.key)}
              className="text-amber-500 hover:text-amber-700"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function SwitchStatusCard({ sw }: { sw?: SwitchSettings }) {
  const queryClient = useQueryClient();

  const checkInMutation = useMutation({
    mutationFn: () => api.checkIn(),
    onSuccess: () => {
      toast({ title: "Checked in — timer reset.", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["switch"] });
    },
    onError: (err) => {
      toast({ title: err instanceof APIError ? err.message : "Check-in failed", variant: "destructive" });
    },
  });

  const revokeDeliveriesMutation = useMutation({
    mutationFn: () => api.revokeDeliveries(),
    onSuccess: (data) => {
      const n = data.revoked;
      toast({
        title: n > 0
          ? `Access revoked. ${n} delivery link${n === 1 ? "" : "s"} invalidated.`
          : "No active delivery links to revoke.",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["switch"] });
    },
    onError: (err) => {
      toast({ title: err instanceof APIError ? err.message : "Failed to revoke access", variant: "destructive" });
    },
  });

  const handleRevoke = () => {
    if (window.confirm("This will immediately invalidate all active delivery links. Beneficiaries will no longer be able to access your vault. Continue?")) {
      revokeDeliveriesMutation.mutate();
    }
  };

  if (!sw || sw.status === "inactive") {
    return (
      <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700/50">
        <CardContent className="flex items-start gap-3 py-4">
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Your switch is not active</p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
              Add a vault and beneficiary to activate your Emergency Release Switch.
            </p>
          </div>
          <Button asChild size="sm" variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700/50 dark:text-amber-400 dark:hover:bg-amber-950/50 flex-shrink-0">
            <Link href="/settings">Set up</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (sw.status === "paused") {
    return (
      <Card className="border-border">
        <CardContent className="flex items-start gap-3 py-4">
          <PauseCircle className="h-5 w-5 text-text-muted flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text-primary">Switch is paused</p>
            <p className="text-xs text-text-secondary mt-0.5">
              {sw.paused_until
                ? `Resumes ${formatDate(sw.paused_until)}`
                : "Paused indefinitely"}
            </p>
          </div>
          <Button asChild size="sm" variant="outline" className="flex-shrink-0">
            <Link href="/settings">Manage</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (sw.status === "triggered") {
    const abortWindowOpen = sw.abort_deadline
      ? new Date(sw.abort_deadline) > new Date()
      : false;
    return (
      <Card className="border-destructive bg-destructive-50 dark:bg-destructive/10">
        <CardContent className="flex items-start gap-3 py-4">
          <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-destructive dark:text-destructive">Your switch has triggered</p>
            <p className="text-xs text-destructive/85 dark:text-destructive/75 mt-0.5">
              {abortWindowOpen
                ? `Abort window closes ${formatRelative(sw.abort_deadline!)}`
                : "Delivery in progress"}
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Button
              size="sm"
              variant="outline"
              loading={revokeDeliveriesMutation.isPending}
              onClick={handleRevoke}
              className="border-destructive/40 text-destructive hover:bg-destructive/10 dark:bg-transparent dark:hover:bg-destructive/20"
            >
              Revoke access
            </Button>
            {abortWindowOpen && (
              <Button asChild size="sm" variant="destructive">
                <Link href="/settings">I&apos;m here</Link>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Active
  const daysUntil = sw.next_checkin_deadline ? getDaysUntil(sw.next_checkin_deadline) : null;
  const hoursUntil = sw.next_checkin_deadline ? getHoursUntil(sw.next_checkin_deadline) : null;
  const isOverdue = hoursUntil !== null && hoursUntil < 0;
  const isUrgent = !isOverdue && hoursUntil !== null && hoursUntil < 24;

  if (isOverdue) {
    return (
      <Card className="border-destructive bg-destructive-50 dark:bg-destructive/10">
        <CardContent className="flex items-start gap-3 py-4">
          <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-destructive">Check-in overdue</p>
            <p className="text-xs text-destructive/85 dark:text-destructive/75 mt-0.5">
              Your check-in window has passed. Check in now to prevent vault delivery.
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Button
              size="sm"
              variant="outline"
              loading={revokeDeliveriesMutation.isPending}
              onClick={handleRevoke}
              className="border-destructive/40 text-destructive hover:bg-destructive/10 dark:bg-transparent dark:hover:bg-destructive/20"
            >
              Revoke access
            </Button>
            <Button
              size="sm"
              variant="destructive"
              loading={checkInMutation.isPending}
              onClick={() => checkInMutation.mutate()}
            >
              Check in now
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={isUrgent ? "border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700/50" : "border-border"}>
      <CardContent className="flex items-start gap-3 py-4">
        <CheckCircle2 className={`h-5 w-5 flex-shrink-0 mt-0.5 ${isUrgent ? "text-amber-600 dark:text-amber-400" : "text-success-600"}`} />
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${isUrgent ? "text-amber-800 dark:text-amber-300" : "text-text-primary"}`}>
            Switch is active
          </p>
          <p className={`text-xs mt-0.5 ${isUrgent ? "text-amber-700 dark:text-amber-400" : "text-text-secondary"}`}>
            {sw.next_checkin_deadline
              ? isUrgent
                ? `Check in soon — due in ${formatDeadlineCountdown(sw.next_checkin_deadline)}`
                : `Next check-in due ${daysUntil !== null && daysUntil > 0 ? `in ${daysUntil} day${daysUntil === 1 ? "" : "s"}` : "today"}`
              : "Waiting for first check-in"}
          </p>
        </div>
        <div className="flex-shrink-0 text-right space-y-1">
          <Button
            size="sm"
            variant={isUrgent ? "warning" : "outline"}
            loading={checkInMutation.isPending}
            onClick={() => checkInMutation.mutate()}
          >
            Check in
          </Button>
          <p className="text-xs text-text-muted">Logging in also counts</p>
        </div>
      </CardContent>
    </Card>
  );
}

function StatCard({
  label,
  value,
  icon,
  href,
  small,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  href: string;
  small?: boolean;
}) {
  return (
    <Link href={href} className="block">
      <Card className="card-hover">
        <CardContent className="py-4 px-4">
          <div className="flex items-center gap-2 text-text-muted mb-2">
            {icon}
            <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
          </div>
          <p className={`font-semibold text-text-primary ${small ? "text-base" : "text-2xl"}`}>
            {value}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}

function VaultRow({ vault }: { vault: Vault }) {
  return (
    <Link href={`/vaults/${vault.id}`}>
      <div className="flex items-center justify-between px-4 py-3 rounded-lg border border-border bg-surface hover:border-primary/30 hover:bg-surface-muted transition-colors">
        <div className="flex items-center gap-3 min-w-0">
          <VaultIcon className="h-4 w-4 text-text-muted flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-text-primary truncate">{vault.name}</p>
            {vault.description && (
              <p className="text-xs text-text-muted truncate">{vault.description}</p>
            )}
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-text-muted flex-shrink-0 ml-2" />
      </div>
    </Link>
  );
}
