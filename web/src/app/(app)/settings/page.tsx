"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  PauseCircle,
  PlayCircle,
  AlertTriangle,
  Shield,
  Bell,
  User,
  Clock,
  Monitor,
  Trash2,
  KeyRound,
  Copy,
  Eye,
  EyeOff,
} from "lucide-react";
import { api, APIError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, PasswordInput, PasswordStrengthMeter, NumberInput } from "@/components/ui/input";
import {
  getMEK,
  storeMEK,
  deriveKEK,
  wrapMEK,
  getCryptoSession,
  storeCryptoSession,
  generateRecoveryMnemonic,
  validateRecoveryMnemonic,
  wrapMEKWithRecoveryKey,
} from "@/lib/crypto";
import type { Argon2Params } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toaster";
import { useAuthStore } from "@/store/auth";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { formatDate, formatRelativeDate as formatRelative, formatDeadlineCountdown, formatHour } from "@/lib/utils";
import type { SwitchSettings } from "@/types";

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Settings</h1>
        <p className="text-sm text-text-secondary mt-1">
          Manage your switch, account, and security preferences.
        </p>
      </div>

      <SwitchSection />
      <AccountSection />
      <SecuritySection />
      <SessionsSection />
    </div>
  );
}

// ---- Switch section ----
function SwitchSection() {
  const queryClient = useQueryClient();
  const [showPauseForm, setShowPauseForm] = useState(false);
  const [showUpdateForm, setShowUpdateForm] = useState(false);

  const { data: sw, isLoading } = useQuery({
    queryKey: ["switch"],
    queryFn: () => api.getSwitch() as Promise<SwitchSettings>,
  });

  const checkInMutation = useMutation({
    mutationFn: () => api.checkIn(),
    onSuccess: () => {
      toast({ title: "Check-in recorded. Your timer has been reset.", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["switch"] });
    },
    onError: (err) => {
      toast({ title: err instanceof APIError ? err.message : "Check-in failed", variant: "destructive" });
    },
  });

  const abortMutation = useMutation({
    mutationFn: () => api.abortTrigger(),
    onSuccess: () => {
      toast({ title: "Trigger aborted. Your switch is active again.", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["switch"] });
    },
    onError: (err) => {
      toast({ title: err instanceof APIError ? err.message : "Failed to abort", variant: "destructive" });
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

  const resumeMutation = useMutation({
    mutationFn: () => api.resumeSwitch(),
    onSuccess: () => {
      toast({ title: "Switch resumed", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["switch"] });
    },
    onError: (err) => {
      toast({ title: err instanceof APIError ? err.message : "Failed to resume", variant: "destructive" });
    },
  });

  const activateMutation = useMutation({
    mutationFn: () => api.updateSwitch({ is_active: true }),
    onSuccess: () => {
      toast({ title: "Switch activated", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["switch"] });
    },
    onError: (err) => {
      toast({ title: err instanceof APIError ? err.message : "Failed to activate", variant: "destructive" });
    },
  });

  if (isLoading || !sw) {
    return <div className="h-40 rounded-xl skeleton" />;
  }

  const statusConfig = {
    active: {
      icon: <CheckCircle2 className="h-5 w-5 text-success-600" />,
      label: "Active",
      color: "text-success-600",
      bg: "bg-success-50",
    },
    paused: {
      icon: <PauseCircle className="h-5 w-5 text-text-muted" />,
      label: "Paused",
      color: "text-text-muted",
      bg: "bg-surface-muted",
    },
    triggered: {
      icon: <AlertTriangle className="h-5 w-5 text-destructive" />,
      label: "Triggered",
      color: "text-destructive",
      bg: "bg-destructive-50",
    },
    inactive: {
      icon: <Clock className="h-5 w-5 text-text-muted" />,
      label: "Inactive",
      color: "text-text-muted",
      bg: "bg-surface-muted",
    },
    delivered: {
      icon: <CheckCircle2 className="h-5 w-5 text-text-muted" />,
      label: "Delivered",
      color: "text-text-muted",
      bg: "bg-surface-muted",
    },
  };

  const sc = statusConfig[sw.status as keyof typeof statusConfig] ?? statusConfig.inactive;

  return (
    <section>
      <h2 className="text-base font-semibold text-text-primary mb-3 flex items-center gap-2">
        <Bell className="h-4 w-4" />
        Emergency Release Switch
      </h2>

      <Card>
        <CardContent className="pt-5 space-y-5">
          {/* Status row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {sc.icon}
              <span className={`text-sm font-medium ${sc.color}`}>{sc.label}</span>
            </div>

            {sw.status === "active" && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowPauseForm(true)}
                  className="gap-1.5"
                >
                  <PauseCircle className="h-3.5 w-3.5" /> Pause
                </Button>
                <Button
                  size="sm"
                  loading={checkInMutation.isPending}
                  onClick={() => checkInMutation.mutate()}
                  className="gap-1.5"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Check in
                </Button>
              </div>
            )}

            {sw.status === "triggered" && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  loading={revokeDeliveriesMutation.isPending}
                  onClick={() => {
                    if (window.confirm("This will immediately invalidate all active delivery links. Beneficiaries will no longer be able to access your vault. Continue?")) {
                      revokeDeliveriesMutation.mutate();
                    }
                  }}
                  className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive-50"
                >
                  Revoke access
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  loading={abortMutation.isPending}
                  onClick={() => abortMutation.mutate()}
                  className="gap-1.5"
                >
                  <PlayCircle className="h-3.5 w-3.5" /> I&apos;m here — stop delivery
                </Button>
              </div>
            )}

            {sw.status === "delivered" && (
              <Button
                size="sm"
                variant="outline"
                loading={revokeDeliveriesMutation.isPending}
                onClick={() => {
                  if (window.confirm("This will immediately invalidate all active delivery links. Beneficiaries will no longer be able to access your vault. Continue?")) {
                    revokeDeliveriesMutation.mutate();
                  }
                }}
                className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive-50"
              >
                Revoke access
              </Button>
            )}

            {sw.status === "paused" && (
              <Button
                size="sm"
                variant="outline"
                loading={resumeMutation.isPending}
                onClick={() => resumeMutation.mutate()}
                className="gap-1.5"
              >
                <PlayCircle className="h-3.5 w-3.5" /> Resume
              </Button>
            )}

            {sw.status === "inactive" && (
              <Button
                size="sm"
                loading={activateMutation.isPending}
                onClick={() => activateMutation.mutate()}
                className="gap-1.5"
              >
                <PlayCircle className="h-3.5 w-3.5" /> Activate switch
              </Button>
            )}
          </div>

          {/* Timeline info */}
          {sw.status === "active" && sw.next_checkin_deadline && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-x-8 gap-y-1">
                <InfoRow label="Next check-in due" value={formatDeadlineCountdown(sw.next_checkin_deadline)} />
                <InfoRow label="Last check-in" value={sw.last_checkin_at ? formatRelative(sw.last_checkin_at) : "Never"} />
              </div>
              <p className="text-xs text-text-muted">
                Tip: logging in to your account also counts as a check-in and resets the timer.
              </p>
            </div>
          )}

          {sw.status === "triggered" && sw.abort_deadline && (
            <div className="p-3 rounded-lg bg-destructive-50 border border-destructive/20">
              <p className="text-sm text-destructive-700">
                <strong>Your vaults will be delivered</strong> unless you abort by{" "}
                {formatDate(sw.abort_deadline)}.
              </p>
            </div>
          )}

          {sw.status === "paused" && sw.paused_until && (
            <InfoRow label="Resumes" value={formatDate(sw.paused_until)} />
          )}

          {/* Pause form */}
          {showPauseForm && (
            <PauseForm
              onDone={() => {
                setShowPauseForm(false);
                queryClient.invalidateQueries({ queryKey: ["switch"] });
              }}
              onCancel={() => setShowPauseForm(false)}
            />
          )}

          <div className="border-t border-border pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-text-primary">Timing configuration</h3>
              <Button
                size="sm"
                variant={showUpdateForm ? "ghost" : "outline"}
                onClick={() => setShowUpdateForm((v) => !v)}
              >
                {showUpdateForm ? "Cancel" : "Edit"}
              </Button>
            </div>

            {showUpdateForm ? (
              <SwitchUpdateForm
                sw={sw}
                onDone={() => {
                  setShowUpdateForm(false);
                  queryClient.invalidateQueries({ queryKey: ["switch"] });
                }}
              />
            ) : (
              <SwitchTimingDisplay sw={sw} />
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function SwitchTimingDisplay({ sw }: { sw: SwitchSettings }) {
  const rows = [
    { label: "Check-in interval", value: `Every ${sw.check_in_interval_days} day${sw.check_in_interval_days === 1 ? "" : "s"}` },
    { label: "Preferred check-in time", value: sw.preferred_checkin_hour !== null && sw.preferred_checkin_hour !== undefined ? formatHour(sw.preferred_checkin_hour) : "Not set (any time)" },
    { label: "First reminder", value: `${sw.reminder1_days_before} day${sw.reminder1_days_before === 1 ? "" : "s"} before deadline` },
    { label: "Second reminder", value: `${sw.reminder2_hours_before} hour${sw.reminder2_hours_before === 1 ? "" : "s"} before deadline` },
    { label: "Final warning", value: `${sw.final_warning_hours_before} hour${sw.final_warning_hours_before === 1 ? "" : "s"} before deadline` },
    { label: "Abort window", value: `${sw.abort_window_hours} hour${sw.abort_window_hours === 1 ? "" : "s"} after trigger` },
  ];

  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <InfoRow key={r.label} label={r.label} value={r.value} />
      ))}
    </div>
  );
}

const switchUpdateSchema = z.object({
  check_in_interval_days: z.coerce.number().int().min(1).max(365),
  reminder1_days_before: z.coerce.number().int().min(1).max(30),
  reminder2_hours_before: z.coerce.number().int().min(1).max(72),
  final_warning_hours_before: z.coerce.number().int().min(1).max(24),
  abort_window_hours: z.coerce.number().int().min(0).max(72),
});

function SwitchUpdateForm({ sw, onDone }: { sw: SwitchSettings; onDone: () => void }) {
  const [preferredHour, setPreferredHour] = useState<string>(
    sw.preferred_checkin_hour !== null && sw.preferred_checkin_hour !== undefined
      ? String(sw.preferred_checkin_hour)
      : ""
  );

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(switchUpdateSchema),
    defaultValues: {
      check_in_interval_days: sw.check_in_interval_days,
      reminder1_days_before: sw.reminder1_days_before,
      reminder2_hours_before: sw.reminder2_hours_before,
      final_warning_hours_before: sw.final_warning_hours_before,
      abort_window_hours: sw.abort_window_hours,
    },
  });

  const mutation = useMutation({
    mutationFn: (data: z.infer<typeof switchUpdateSchema>) => {
      const hourPayload = preferredHour !== ""
        ? { preferred_checkin_hour: Number(preferredHour) }
        : { clear_preferred_hour: true };
      return api.updateSwitch({ ...data, ...hourPayload });
    },
    onSuccess: () => {
      toast({ title: "Switch settings saved", variant: "success" });
      onDone();
    },
    onError: (err) => {
      toast({ title: err instanceof APIError ? err.message : "Failed to save", variant: "destructive" });
    },
  });

  const hourOptions = Array.from({ length: 24 }, (_, i) => ({ value: String(i), label: formatHour(i) }));

  return (
    <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <NumberInput
          label="Check-in interval (days)"
          hint="1–365"
          suggestions={[1, 2, 3, 5, 7, 10, 14, 21, 30, 60, 90, 180, 365]}
          error={errors.check_in_interval_days?.message}
          {...register("check_in_interval_days")}
        />
        <div className="space-y-1">
          <label className="text-xs font-medium text-text-secondary">Preferred check-in time</label>
          <select
            value={preferredHour}
            onChange={(e) => setPreferredHour(e.target.value)}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="">Any time (no preference)</option>
            {hourOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <p className="text-xs text-text-muted">Deadlines will be set to this hour of day</p>
        </div>
        <NumberInput
          label="First reminder (days before)"
          hint="1–30"
          suggestions={[1, 2, 3, 5, 7, 10, 14, 21, 30]}
          error={errors.reminder1_days_before?.message}
          {...register("reminder1_days_before")}
        />
        <NumberInput
          label="Second reminder (hours before)"
          hint="1–72"
          suggestions={[1, 2, 4, 6, 12, 24, 48, 72]}
          error={errors.reminder2_hours_before?.message}
          {...register("reminder2_hours_before")}
        />
        <NumberInput
          label="Final warning (hours before)"
          hint="1–24"
          suggestions={[1, 2, 4, 6, 12, 24]}
          error={errors.final_warning_hours_before?.message}
          {...register("final_warning_hours_before")}
        />
        <NumberInput
          label="Abort window (hours after trigger)"
          hint="0–72"
          suggestions={[0, 1, 2, 4, 6, 12, 24, 48, 72]}
          error={errors.abort_window_hours?.message}
          {...register("abort_window_hours")}
        />
      </div>
      <div className="flex justify-end">
        <Button type="submit" size="sm" loading={mutation.isPending}>
          Save timing
        </Button>
      </div>
    </form>
  );
}

const pauseSchema = z.object({
  resume_at: z.string().optional(),
});

function PauseForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const { register, handleSubmit } = useForm({ resolver: zodResolver(pauseSchema) });

  const mutation = useMutation({
    mutationFn: (data: { resume_at?: string }) =>
      api.pauseSwitch(data.resume_at ? { resume_at: data.resume_at } : {}),
    onSuccess: () => {
      toast({ title: "Switch paused", variant: "default" });
      onDone();
    },
    onError: (err) => {
      toast({ title: err instanceof APIError ? err.message : "Failed to pause", variant: "destructive" });
    },
  });

  return (
    <div className="p-3 rounded-lg border border-border bg-surface-muted space-y-3">
      <p className="text-sm text-text-primary font-medium">Pause switch</p>
      <p className="text-xs text-text-secondary">
        Use this during surgery, vacation, or any planned period of absence. No reminders or triggers will fire while paused.
      </p>
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-3">
        <Input
          label="Resume date (optional)"
          type="datetime-local"
          hint="Leave blank to pause indefinitely"
          {...register("resume_at")}
        />
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" size="sm" variant="warning" loading={mutation.isPending}>
            Pause switch
          </Button>
        </div>
      </form>
    </div>
  );
}

// ---- Account section ----
const accountSchema = z.object({
  display_name: z.string().min(1, "Name is required").max(100),
});

function AccountSection() {
  const { user } = useAuthStore();
  const [editingName, setEditingName] = useState(false);
  const [editingEmail, setEditingEmail] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(accountSchema),
    defaultValues: { display_name: user?.display_name ?? "" },
  });

  const mutation = useMutation({
    mutationFn: (data: { display_name: string }) => api.updateMe(data),
    onSuccess: () => {
      toast({ title: "Name updated", variant: "success" });
      setEditingName(false);
    },
    onError: (err) => {
      toast({ title: err instanceof APIError ? err.message : "Update failed", variant: "destructive" });
    },
  });

  return (
    <section>
      <h2 className="text-base font-semibold text-text-primary mb-3 flex items-center gap-2">
        <User className="h-4 w-4" />
        Account
      </h2>
      <Card>
        <CardContent className="pt-5 space-y-4">
          {/* Name row */}
          {editingName ? (
            <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-3">
              <Input label="Your name" error={errors.display_name?.message} {...register("display_name")} />
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="ghost" size="sm" onClick={() => setEditingName(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" loading={mutation.isPending}>
                  Save
                </Button>
              </div>
            </form>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-text-muted">Name</p>
                <p className="text-sm text-text-primary mt-0.5">{user?.display_name ?? "—"}</p>
              </div>
              <Button size="sm" variant="outline" className="flex-shrink-0" onClick={() => { setEditingEmail(false); setEditingName(true); }}>
                Edit
              </Button>
            </div>
          )}

          {/* Email row */}
          <div className="border-t border-border pt-4">
            <ChangeEmailForm
              expanded={editingEmail}
              onExpand={() => { setEditingName(false); setEditingEmail(true); }}
              onCollapse={() => setEditingEmail(false)}
            />
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

// ---- Security section ----
function SecuritySection() {
  return (
    <section>
      <h2 className="text-base font-semibold text-text-primary mb-3 flex items-center gap-2">
        <Shield className="h-4 w-4" />
        Security
      </h2>
      <Card>
        <CardContent className="pt-5 space-y-3">
          <ChangePasswordForm />
          <div className="border-t border-border pt-3">
            <MFASection />
          </div>
          <div className="border-t border-border pt-3">
            <RecoveryKeySection />
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

// ---- Shared helpers ----
// ---- MFA Section ----

type MFAStep = "idle" | "setup" | "verify" | "backup-codes";

function MFASection() {
  const { user, accessToken, setAuth } = useAuthStore();
  const [step, setStep] = useState<MFAStep>("idle");
  const [setupData, setSetupData] = useState<{ secret: string; otp_url: string; backup_codes: string[] } | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const setupMutation = useMutation({
    mutationFn: () => api.setupMFA(),
    onSuccess: async (data) => {
      setSetupData(data);
      // Generate QR code data URL using the browser's canvas API via a simple URL
      setQrDataUrl(`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(data.otp_url)}`);
      setStep("setup");
    },
    onError: (err) => {
      toast({ title: err instanceof APIError ? err.message : "Failed to start setup", variant: "destructive" });
    },
  });

  const verifyMutation = useMutation({
    mutationFn: (code: string) =>
      api.verifyMFA({ secret: setupData!.secret, code, backup_codes: setupData!.backup_codes }),
    onSuccess: () => {
      setStep("backup-codes");
    },
    onError: (err) => {
      toast({ title: err instanceof APIError ? err.message : "Invalid code — try again", variant: "destructive" });
    },
  });

  const disableMutation = useMutation({
    mutationFn: (code: string) => api.disableMFA(code),
    onSuccess: () => {
      toast({ title: "Two-factor authentication disabled", variant: "default" });
      if (user) setAuth({ ...user, mfa_enabled: false }, accessToken ?? "");
      setStep("idle");
    },
    onError: (err) => {
      toast({ title: err instanceof APIError ? err.message : "Invalid code", variant: "destructive" });
    },
  });

  const isMFAEnabled = user?.mfa_enabled;

  if (step === "setup" && setupData) {
    return <MFASetupStep
      otpUrl={setupData.otp_url}
      secret={setupData.secret}
      qrDataUrl={qrDataUrl}
      onVerify={(code) => verifyMutation.mutate(code)}
      isLoading={verifyMutation.isPending}
      onCancel={() => setStep("idle")}
    />;
  }

  if (step === "backup-codes" && setupData) {
    return <MFABackupCodesStep
      backupCodes={setupData.backup_codes}
      onDone={() => {
        if (user) setAuth({ ...user, mfa_enabled: true }, accessToken ?? "");
        setStep("idle");
        toast({ title: "Two-factor authentication enabled", variant: "success" });
      }}
    />;
  }

  if (step === "verify" && isMFAEnabled) {
    return <MFADisableStep
      onDisable={(code) => disableMutation.mutate(code)}
      isLoading={disableMutation.isPending}
      onCancel={() => setStep("idle")}
    />;
  }

  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-text-primary">Two-factor authentication</p>
        <p className="text-xs text-text-muted">
          {isMFAEnabled ? "Enabled — your account is protected with TOTP" : "Add an extra layer of security"}
        </p>
      </div>
      {isMFAEnabled ? (
        <Button size="sm" variant="outline" className="text-destructive hover:bg-destructive-50 hover:border-destructive/30" onClick={() => setStep("verify")}>
          Disable
        </Button>
      ) : (
        <Button size="sm" variant="outline" loading={setupMutation.isPending} onClick={() => setupMutation.mutate()}>
          Set up
        </Button>
      )}
    </div>
  );
}

function MFASetupStep({
  secret, qrDataUrl, onVerify, isLoading, onCancel,
}: {
  otpUrl: string;
  secret: string;
  qrDataUrl: string | null;
  onVerify: (code: string) => void;
  isLoading: boolean;
  onCancel: () => void;
}) {
  const [code, setCode] = useState("");

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-text-primary">Set up two-factor authentication</p>
        <p className="text-xs text-text-muted mt-0.5">Scan the QR code with your authenticator app (e.g. Authy, Google Authenticator).</p>
      </div>
      <div className="flex flex-col items-center gap-3">
        {qrDataUrl && (
          <img src={qrDataUrl} alt="MFA QR code" className="rounded-lg border border-border w-[180px] h-[180px]" />
        )}
        <div className="text-center">
          <p className="text-xs text-text-muted mb-1">Or enter this code manually:</p>
          <code className="text-xs bg-surface-muted px-3 py-1.5 rounded font-mono tracking-widest">{secret}</code>
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-xs text-text-secondary">Enter the 6-digit code from your app to confirm:</p>
        <div className="flex gap-2">
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="flex-1 px-3 py-2 text-sm rounded-md border border-border bg-surface focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono tracking-widest text-center"
          />
          <Button onClick={() => onVerify(code)} loading={isLoading} disabled={code.length !== 6}>
            Verify
          </Button>
        </div>
      </div>
      <button onClick={onCancel} className="text-xs text-text-muted hover:text-text-secondary underline underline-offset-2">
        Cancel
      </button>
    </div>
  );
}

function MFABackupCodesStep({ backupCodes, onDone }: { backupCodes: string[]; onDone: () => void }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-text-primary">Save your backup codes</p>
        <p className="text-xs text-text-muted mt-0.5">Store these somewhere safe. Each can be used once if you lose access to your authenticator app.</p>
      </div>
      <div className="grid grid-cols-2 gap-1.5 bg-surface-muted rounded-lg p-3">
        {backupCodes.map((code) => (
          <code key={code} className="text-xs font-mono text-text-primary text-center py-0.5">{code}</code>
        ))}
      </div>
      <Button onClick={onDone} className="w-full">I've saved these codes</Button>
    </div>
  );
}

function MFADisableStep({ onDisable, isLoading, onCancel }: { onDisable: (code: string) => void; isLoading: boolean; onCancel: () => void }) {
  const [code, setCode] = useState("");

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium text-text-primary">Disable two-factor authentication</p>
        <p className="text-xs text-text-muted mt-0.5">Enter your current authenticator code or a backup code to confirm.</p>
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          inputMode="numeric"
          maxLength={10}
          placeholder="000000"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="flex-1 px-3 py-2 text-sm rounded-md border border-border bg-surface focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono tracking-widest text-center"
        />
        <Button variant="destructive" onClick={() => onDisable(code)} loading={isLoading} disabled={code.length < 6}>
          Disable
        </Button>
      </div>
      <button onClick={onCancel} className="text-xs text-text-muted hover:text-text-secondary underline underline-offset-2">
        Cancel
      </button>
    </div>
  );
}

// ---- Change Email Form ----
const changeEmailSchema = z.object({
  new_email: z.string().email("Enter a valid email address"),
  current_password: z.string().min(1, "Current password is required"),
});

function ChangeEmailForm({
  expanded,
  onExpand,
  onCollapse,
}: {
  expanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
}) {
  const { user } = useAuthStore();
  const [sent, setSent] = useState(false);

  type ChangeEmailFormValues = z.infer<typeof changeEmailSchema>;
  const { register, handleSubmit, reset, formState: { errors } } = useForm<ChangeEmailFormValues>({
    resolver: zodResolver(changeEmailSchema),
  });

  const mutation = useMutation({
    mutationFn: (data: ChangeEmailFormValues) => api.changeEmail(data.new_email, data.current_password),
    onSuccess: () => {
      setSent(true);
      reset();
    },
    onError: (err) => {
      toast({ title: err instanceof APIError ? err.message : "Failed to request email change", variant: "destructive" });
    },
  });

  if (sent) {
    return (
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-text-muted">Email</p>
          <p className="text-xs text-success-600 mt-0.5">Verification email sent — check your new inbox to confirm the change.</p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => { setSent(false); onCollapse(); }}>Dismiss</Button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-text-muted">Email</p>
          <p className="text-sm text-text-primary mt-0.5">{user?.email ?? "—"}</p>
        </div>
        <Button size="sm" variant={expanded ? "ghost" : "outline"} className="flex-shrink-0" onClick={() => { reset(); expanded ? onCollapse() : onExpand(); }}>
          {expanded ? "Cancel" : "Change"}
        </Button>
      </div>
      {expanded && (
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="mt-4 space-y-3">
          <Input
            label="New email address"
            type="email"
            autoComplete="email"
            error={errors.new_email?.message}
            {...register("new_email")}
          />
          <PasswordInput
            label="Current password"
            autoComplete="current-password"
            error={errors.current_password?.message}
            {...register("current_password")}
          />
          <p className="text-xs text-text-muted">A verification link will be sent to your new address. Your email won&apos;t change until you click it.</p>
          <div className="flex justify-end">
            <Button type="submit" size="sm" loading={mutation.isPending}>
              Send verification
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

const changePasswordSchema = z.object({
  current_password: z.string().min(1, "Current password is required"),
  new_password: z.string().min(12, "New password must be at least 12 characters"),
  confirm_password: z.string(),
}).refine((d) => d.new_password === d.confirm_password, {
  message: "Passwords do not match",
  path: ["confirm_password"],
});

function ChangePasswordForm() {
  const [showForm, setShowForm] = useState(false);
  const { user } = useAuthStore();
  type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>;
  const { register, handleSubmit, reset, control, formState: { errors } } = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordSchema),
  });
  const newPasswordValue = useWatch({ control, name: "new_password", defaultValue: "" });

  const mutation = useMutation({
    mutationFn: async (data: ChangePasswordFormValues) => {
      const mek = getMEK();
      if (!mek) throw new Error("Session expired. Please sign in again.");

      const session = getCryptoSession();
      if (!session) throw new Error("Session expired. Please sign in again.");

      // Derive new KEK from the new password (same mek_salt — it never rotates)
      const params: Argon2Params = JSON.parse(session.argon2Params);
      const newKek = await deriveKEK(data.new_password, session.mekSalt, params);

      // Re-wrap the MEK with the new KEK — vault CEK envelopes are unchanged
      const newMEKEnvelope = await wrapMEK(mek, newKek);

      // Send new password + new mek_envelope to server
      await api.changePassword(data.current_password, data.new_password, newMEKEnvelope);

      // Update session storage with new envelope
      storeMEK(mek);
      storeCryptoSession(newMEKEnvelope, session.mekSalt, session.argon2Params);
    },
    onSuccess: () => {
      toast({ title: "Password updated", variant: "success" });
      reset();
      setShowForm(false);
    },
    onError: (err) => {
      toast({ title: err instanceof APIError ? err.message : (err as Error).message ?? "Failed to update password", variant: "destructive" });
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-text-primary">Password</p>
          <p className="text-xs text-text-muted">Change your login password</p>
        </div>
        <Button size="sm" variant={showForm ? "ghost" : "outline"} onClick={() => { setShowForm((v) => !v); reset(); }}>
          {showForm ? "Cancel" : "Change"}
        </Button>
      </div>
      {showForm && (
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="mt-4 space-y-3">
          <PasswordInput
            label="Current password"
            autoComplete="current-password"
            error={errors.current_password?.message}
            {...register("current_password")}
          />
          <div>
            <PasswordInput
              label="New password"
              autoComplete="new-password"
              error={errors.new_password?.message}
              {...register("new_password")}
            />
            <PasswordStrengthMeter value={newPasswordValue} />
          </div>
          <PasswordInput
            label="Confirm new password"
            autoComplete="new-password"
            error={errors.confirm_password?.message}
            {...register("confirm_password")}
          />
          <div className="flex justify-end">
            <Button type="submit" size="sm" loading={mutation.isPending}>
              Update password
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

// ---- Recovery Key Section ----
function RecoveryKeySection() {
  const { data: branding } = useQuery({ queryKey: ["branding"], queryFn: () => api.getBranding(), staleTime: Infinity });
  const appName = branding?.app_name || "P.S. Vault";
  const [step, setStep] = useState<"idle" | "show" | "confirm" | "done">("idle");
  const [mnemonic, setMnemonic] = useState<string>("");
  const [showMnemonic, setShowMnemonic] = useState(false);
  const [confirmWord, setConfirmWord] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const words = mnemonic ? mnemonic.split(" ") : [];
  const confirmIndex = mnemonic
    ? (mnemonic.charCodeAt(0) + mnemonic.charCodeAt(4)) % 24
    : 0;
  const expectedWord = words[confirmIndex] ?? "";

  const handleGenerate = () => {
    const m = generateRecoveryMnemonic();
    setMnemonic(m);
    setShowMnemonic(false);
    setConfirmWord("");
    setStep("show");
  };

  const handleSave = async () => {
    if (confirmWord.trim().toLowerCase() !== expectedWord) {
      toast({ title: `Incorrect word. Please check word #${confirmIndex + 1} and try again.`, variant: "destructive" });
      return;
    }
    const mek = getMEK();
    if (!mek) {
      toast({ title: "Session expired. Please sign in again.", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      const envelope = await wrapMEKWithRecoveryKey(mek, mnemonic);
      await api.setRecoveryKey(envelope);
      setStep("done");
      setMnemonic("");
    } catch (err) {
      toast({ title: err instanceof APIError ? err.message : "Failed to save recovery key.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  if (step === "done") {
    return (
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-text-primary flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-success-600" />
            Recovery key saved
          </p>
          <p className="text-xs text-text-muted mt-0.5">
            Your vault is protected. Store your 24 words somewhere safe.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setStep("idle")}>
          Rotate key
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-text-primary flex items-center gap-1.5">
            <KeyRound className="h-3.5 w-3.5" />
            Recovery key
          </p>
          <p className="text-xs text-text-muted mt-0.5">
            A 24-word key that lets you recover your account if you forget your password
          </p>
        </div>
        {step === "idle" && (
          <Button size="sm" variant="outline" onClick={handleGenerate}>
            Set up
          </Button>
        )}
      </div>

      {step === "show" && mnemonic && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
          <p className="text-xs font-medium text-amber-900">
            Write down all 24 words in order. Do not store them digitally.
          </p>

          <div className="relative">
            <div className={`grid grid-cols-3 gap-1.5 text-xs font-mono ${!showMnemonic ? "blur-sm select-none" : ""}`}>
              {words.map((word, i) => (
                <span key={i} className="flex gap-1 items-center">
                  <span className="text-text-muted w-4 text-right shrink-0">{i + 1}.</span>
                  <span className="text-text-primary">{word}</span>
                </span>
              ))}
            </div>
            {!showMnemonic && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Button size="sm" variant="outline" onClick={() => setShowMnemonic(true)}>
                  <Eye className="h-3.5 w-3.5 mr-1" /> Reveal
                </Button>
              </div>
            )}
          </div>

          {showMnemonic && (
            <button
              onClick={() => {
                const formatted = words
                  .map((w, i) => `${String(i + 1).padStart(2, " ")}. ${w}`)
                  .join("\n");
                navigator.clipboard.writeText(`${appName} Recovery Key\n\n${formatted}`);
                toast({ title: "Copied — store this somewhere safe, not in the cloud.", variant: "success" });
              }}
              className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary"
            >
              <Copy className="h-3 w-3" /> Copy all words
            </button>
          )}

          <div className="flex gap-2 pt-1">
            <Button size="sm" variant="ghost" onClick={() => { setStep("idle"); setMnemonic(""); }}>
              Cancel
            </Button>
            <Button size="sm" disabled={!showMnemonic} onClick={() => setStep("confirm")}>
              I&apos;ve saved these words
            </Button>
          </div>
        </div>
      )}

      {step === "confirm" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
          <p className="text-xs font-medium text-amber-900">
            Confirm word #{confirmIndex + 1} to verify you&apos;ve written it down:
          </p>
          <input
            type="text"
            className="w-full rounded-md border border-input bg-white px-3 py-1.5 text-sm font-mono
                       focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder={`Word #${confirmIndex + 1}`}
            autoComplete="off"
            spellCheck={false}
            autoFocus
            value={confirmWord}
            onChange={(e) => setConfirmWord(e.target.value)}
          />
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setStep("show")}>
              Back
            </Button>
            <Button size="sm" loading={isLoading} onClick={handleSave}>
              Save recovery key
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Sessions section ----
function SessionsSection() {
  const queryClient = useQueryClient();

  const { data: sessions, isLoading } = useQuery({
    queryKey: ["sessions"],
    queryFn: () => api.getSessions(),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => api.revokeSession(id),
    onSuccess: () => {
      toast({ title: "Session revoked", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
    onError: (err) => {
      toast({ title: err instanceof APIError ? err.message : "Failed to revoke session", variant: "destructive" });
    },
  });

  const revokeAllMutation = useMutation({
    mutationFn: () => api.revokeAllSessions(),
    onSuccess: () => {
      toast({ title: "All other sessions revoked", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
    onError: (err) => {
      toast({ title: err instanceof APIError ? err.message : "Failed to revoke sessions", variant: "destructive" });
    },
  });

  const otherSessionCount = sessions ? sessions.length - 1 : 0;

  return (
    <section>
      <h2 className="text-base font-semibold text-text-primary mb-3 flex items-center gap-2">
        <Monitor className="h-4 w-4" />
        Active sessions
      </h2>
      <Card>
        <CardContent className="pt-5">
          {isLoading && <div className="h-20 rounded-lg skeleton" />}
          {!isLoading && (!sessions || sessions.length === 0) && (
            <p className="text-sm text-text-muted text-center py-4">No active sessions found.</p>
          )}
          {sessions && sessions.length > 0 && (
            <ul className="divide-y divide-border">
              {sessions.map((session) => (
                <li key={session.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">
                      {session.device_info || "Unknown device"}
                    </p>
                    <p className="text-xs text-text-muted mt-0.5">
                      {session.ip_address} · Last active {formatRelative(session.last_used_at)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="flex-shrink-0 text-destructive hover:bg-destructive-50 hover:text-destructive"
                    loading={revokeMutation.isPending}
                    onClick={() => revokeMutation.mutate(session.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center justify-between mt-4">
            <p className="text-xs text-text-muted">
              Sessions expire automatically after 7 days of inactivity.
            </p>
            {otherSessionCount > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:bg-destructive-50 hover:text-destructive text-xs"
                loading={revokeAllMutation.isPending}
                onClick={() => revokeAllMutation.mutate()}
              >
                Revoke all other sessions
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-4 py-1">
      <span className="text-xs text-text-muted whitespace-nowrap flex-shrink-0">{label}</span>
      <span className="text-sm text-text-primary truncate">{value}</span>
    </div>
  );
}
