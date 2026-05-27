"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth";
import { ShieldEllipsis as Shield, CheckCircle2, ArrowRight, LockKeyhole as Vault, Users, Bell, Key, Lock, KeyRound, Copy, Eye, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, NumberInput } from "@/components/ui/input";
import { api, APIError } from "@/lib/api";
import { getMEK, generateCEK, wrapCEK, unwrapCEK, wrapCEKForBeneficiary, generateRecoveryMnemonic, validateRecoveryMnemonic, wrapMEKWithRecoveryKey } from "@/lib/crypto";
import type { Beneficiary } from "@/types";
import { toast } from "@/components/ui/toaster";
import { cn, formatHour } from "@/lib/utils";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const STEPS = [
  { id: "welcome",     title: "Welcome",                 icon: Shield },
  { id: "vault",       title: "Create your first vault", icon: Vault },
  { id: "beneficiary", title: "Add a beneficiary",       icon: Users },
  { id: "access",      title: "Grant vault access",      icon: Key },
  { id: "switch",      title: "Set up your switch",      icon: Bell },
  { id: "mfa",         title: "Secure your account",     icon: ShieldCheck },
  { id: "recovery",    title: "Save your recovery key",  icon: KeyRound },
  { id: "done",        title: "You're all set",          icon: CheckCircle2 },
];

const STEP_STORAGE_KEY = "psvault_onboarding_step";

export default function OnboardingPage() {
  const router = useRouter();
  const { refresh, logout } = useAuthStore();
  const [step, setStep] = useState(0);
  const [stepReady, setStepReady] = useState(false);

  // Restore progress from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STEP_STORAGE_KEY);
    if (saved) {
      const n = parseInt(saved, 10);
      if (!isNaN(n) && n > 0 && n < STEPS.length - 1) setStep(n);
    }
    setStepReady(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist step changes
  useEffect(() => {
    if (stepReady) localStorage.setItem(STEP_STORAGE_KEY, String(step));
  }, [step, stepReady]);

  const { data: branding } = useQuery({
    queryKey: ["branding"],
    queryFn: () => api.getBranding(),
    staleTime: Infinity,
  });
  const appName = branding?.app_name || "P.S. Vault";
  const [vaultId, setVaultId] = useState<string | null>(null);
  const [beneficiaryId, setBeneficiaryId] = useState<string | null>(null);

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const skip = () => {
    localStorage.removeItem(STEP_STORAGE_KEY);
    router.push("/dashboard");
  };

  // Refresh token + ensure MEK is present.
  // MEK lives in sessionStorage and is lost on page refresh — redirect to login if missing.
  useEffect(() => {
    refresh().catch(() => {
      logout();
      router.replace("/login");
    });
    if (!getMEK()) {
      router.replace("/login?return=/onboarding");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      {/* Logo */}
      <div className="mb-8 flex items-center gap-2.5">
        <Shield className="h-6 w-6 text-primary" aria-hidden />
        <span className="text-xl font-semibold text-text-primary">{appName}</span>
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-1.5 mb-8">
        {STEPS.map((s, i) => (
          <div
            key={s.id}
            className={cn(
              "h-1.5 rounded-full transition-all duration-300",
              i === step
                ? "w-6 bg-primary"
                : i < step
                ? "w-3 bg-primary-300"
                : "w-3 bg-border"
            )}
          />
        ))}
      </div>

      {/* Card */}
      <div className="w-full max-w-md bg-surface rounded-xl shadow-dialog border border-border p-8">
        {step === 0 && <WelcomeStep onNext={next} onSkip={skip} />}
        {step === 1 && (
          <CreateVaultStep
            onNext={(id) => { setVaultId(id); next(); }}
            onSkip={next}
          />
        )}
        {step === 2 && (
          <AddBeneficiaryStep
            onNext={(id) => { setBeneficiaryId(id); next(); }}
            onSkip={next}
          />
        )}
        {step === 3 && (
          <GrantAccessStep
            vaultId={vaultId}
            beneficiaryId={beneficiaryId}
            onNext={next}
            onSkip={next}
          />
        )}
        {step === 4 && <SwitchStep onNext={next} onSkip={next} />}
        {step === 5 && <MFAStep onNext={next} onSkip={next} />}
        {step === 6 && <RecoveryKeyStep onNext={next} onSkip={next} />}
        {step === 7 && <DoneStep onFinish={skip} />}
      </div>

      {/* Skip link */}
      {step > 0 && step < STEPS.length - 1 && (
        <button
          className="mt-4 text-xs text-text-muted hover:text-text-secondary underline underline-offset-2"
          onClick={skip}
        >
          Skip setup, go to dashboard
        </button>
      )}
    </div>
  );
}

// ---- Step components ----

function WelcomeStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  return (
    <div className="text-center space-y-5">
      <div className="h-14 w-14 rounded-full bg-primary-50 flex items-center justify-center mx-auto">
        <Shield className="h-7 w-7 text-primary" />
      </div>
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Your vault is ready.</h1>
        <p className="text-sm text-text-secondary mt-2">
          Let&apos;s take a few minutes to set up your Emergency Release Switch so your important information reaches the right people if something happens to you.
        </p>
      </div>

      <div className="space-y-2 text-left bg-surface-muted rounded-lg p-4">
        {[
          { icon: Vault, text: "Create vaults to organize your important info" },
          { icon: Users, text: "Add beneficiaries who should receive access" },
          { icon: Key,   text: "Grant each beneficiary vault access with a private access key" },
          { icon: Bell,  text: "Set a check-in schedule — your switch monitors your activity" },
        ].map(({ icon: Icon, text }) => (
          <div key={text} className="flex items-start gap-3">
            <Icon className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
            <p className="text-xs text-text-secondary">{text}</p>
          </div>
        ))}
      </div>

      <Button onClick={onNext} className="w-full gap-2">
        Get started <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

const vaultSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(500).optional(),
});

function CreateVaultStep({
  onNext,
  onSkip,
}: {
  onNext: (vaultId: string) => void;
  onSkip: () => void;
}) {
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(vaultSchema),
    defaultValues: { name: "", description: "" },
  });

  const mutation = useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
      const mek = getMEK();
      if (!mek) throw new Error("Session expired. Please sign in again.");
      const cek = await generateCEK();
      const cekEnvelope = await wrapCEK(cek, mek);
      return api.createVault({ name: data.name, description: data.description, cek_envelope: cekEnvelope });
    },
    onSuccess: (v: { id: string }) => onNext(v.id),
    onError: (err) => {
      toast({ title: err instanceof APIError ? err.message : (err as Error).message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-text-primary">Create your first vault</h2>
        <p className="text-sm text-text-secondary mt-1">
          A vault holds related information — like financial accounts, digital logins, or important documents.
        </p>
      </div>

      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
        <Input
          label="Vault name"
          placeholder="e.g. Financial accounts, Digital life, Family notes..."
          error={errors.name?.message}
          {...register("name")}
        />
        <Input
          label="Description"
          placeholder="Optional — what's inside this vault?"
          {...register("description")}
        />
        <div className="flex gap-2">
          <Button type="button" variant="ghost" className="flex-1" onClick={onSkip}>
            Skip for now
          </Button>
          <Button type="submit" className="flex-1 gap-1" loading={mutation.isPending}>
            Create vault <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}

const beneficiarySchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  email: z.string().email("Please enter a valid email address"),
  relationship: z.string().max(100).optional(),
});

type BeneficiaryForm = z.infer<typeof beneficiarySchema>;

function AddBeneficiaryStep({ onNext, onSkip }: { onNext: (id: string) => void; onSkip: () => void }) {
  const { register, handleSubmit, formState: { errors } } = useForm<BeneficiaryForm>({
    resolver: zodResolver(beneficiarySchema),
  });

  const mutation = useMutation({
    mutationFn: (data: BeneficiaryForm) =>
      api.createBeneficiary(data) as Promise<Beneficiary>,
    onSuccess: (b: Beneficiary) => {
      toast({ title: "Invitation sent!", variant: "success" });
      onNext(b.id);
    },
    onError: (err) => {
      toast({ title: err instanceof APIError ? err.message : "Failed to add", variant: "destructive" });
    },
  });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-text-primary">Add a beneficiary</h2>
        <p className="text-sm text-text-secondary mt-1">
          This is the person who will receive access to your vaults. They&apos;ll get an email to confirm.
        </p>
      </div>

      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
        <Input
          label="Their name"
          placeholder="Jane Smith"
          error={errors.name?.message}
          {...register("name")}
        />
        <Input
          label="Their email"
          type="email"
          placeholder="jane@example.com"
          error={errors.email?.message}
          {...register("email")}
        />
        <Input
          label="Relationship"
          placeholder="e.g. Spouse, Child, Trusted friend"
          {...register("relationship")}
        />
        <div className="flex gap-2">
          <Button type="button" variant="ghost" className="flex-1" onClick={onSkip}>
            Skip for now
          </Button>
          <Button type="submit" className="flex-1 gap-1" loading={mutation.isPending}>
            Send invite <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}

const accessKeySchema = z.object({
  accessKey: z.string().min(8, "Access key must be at least 8 characters"),
});

function GrantAccessStep({
  vaultId,
  beneficiaryId,
  onNext,
  onSkip,
}: {
  vaultId: string | null;
  beneficiaryId: string | null;
  onNext: () => void;
  onSkip: () => void;
}) {
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(accessKeySchema),
    defaultValues: { accessKey: "" },
  });

  const mutation = useMutation({
    mutationFn: async ({ accessKey }: { accessKey: string }) => {
      if (!vaultId || !beneficiaryId) throw new Error("Missing vault or beneficiary");
      const mek = getMEK();
      if (!mek) throw new Error("Session expired. Please sign in again.");
      const vault = await api.getVault(vaultId);
      const cek = await unwrapCEK(vault.cek_envelope, mek);
      const beneficiaryCekEnvelope = await wrapCEKForBeneficiary(cek, accessKey);
      await api.assignBeneficiaryToVault(vaultId, {
        beneficiary_id: beneficiaryId,
        beneficiary_cek_envelope: beneficiaryCekEnvelope,
      });
    },
    onSuccess: () => {
      toast({ title: "Access granted!", variant: "success" });
      onNext();
    },
    onError: (err) => {
      toast({ title: err instanceof APIError ? err.message : (err as Error).message, variant: "destructive" });
    },
  });

  // If either step was skipped, show an informational step
  if (!vaultId || !beneficiaryId) {
    return (
      <div className="space-y-5">
        <div className="h-14 w-14 rounded-full bg-primary-50 flex items-center justify-center mx-auto">
          <Key className="h-7 w-7 text-primary" />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-semibold text-text-primary">Grant vault access</h2>
          <p className="text-sm text-text-secondary mt-2">
            Once you&apos;ve created a vault and added a beneficiary, you&apos;ll need to grant them access from the vault page. Open a vault, click <span className="font-medium text-text-primary">Grant access</span>, and create a unique access key to share with them privately.
          </p>
        </div>
        <div className="bg-surface-muted rounded-lg p-4 text-xs text-text-secondary space-y-1.5">
          <p className="font-medium text-text-primary">How it works:</p>
          <ol className="list-decimal list-inside space-y-1 pl-1">
            <li>Open any vault → click <span className="font-medium">Grant access</span></li>
            <li>Choose a beneficiary and create a unique access key</li>
            <li>Share that key with your beneficiary privately (e.g. in a letter)</li>
          </ol>
        </div>
        <Button onClick={onSkip} className="w-full">
          Got it
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-text-primary">Grant vault access</h2>
        <p className="text-sm text-text-secondary mt-1">
          Create a unique access key for your beneficiary. You&apos;ll share this key with them privately — it&apos;s what they&apos;ll use to unlock your vault.
        </p>
      </div>

      <div className="bg-surface-muted rounded-lg p-3 text-xs text-text-secondary space-y-1">
        <p className="font-medium text-text-primary">Keep this key safe</p>
        <p>Write it down and store it somewhere secure, like a sealed letter or a password manager. Your beneficiary will need it to access the vault.</p>
      </div>

      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
        <Input
          label="Access key"
          type="text"
          placeholder="e.g. BlueOcean-2847-Sunrise"
          hint="Use something memorable but not obvious. Min 8 characters."
          error={errors.accessKey?.message}
          {...register("accessKey")}
        />
        <div className="flex gap-2">
          <Button type="button" variant="ghost" className="flex-1" onClick={onSkip}>
            Skip for now
          </Button>
          <Button type="submit" className="flex-1 gap-1" loading={mutation.isPending}>
            Grant access <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}

const switchSchema = z.object({
  check_in_interval_days: z.coerce.number().int().min(1).max(365),
});

function SwitchStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const [preferredHour, setPreferredHour] = useState<string>("");
  const hourOptions = Array.from({ length: 24 }, (_, i) => ({ value: String(i), label: formatHour(i) }));

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(switchSchema),
    defaultValues: { check_in_interval_days: 7 },
  });

  const mutation = useMutation({
    mutationFn: async (data: { check_in_interval_days: number }) => {
      const hourPayload = preferredHour !== ""
        ? { preferred_checkin_hour: Number(preferredHour) }
        : { clear_preferred_hour: true };
      await api.updateSwitch({ ...data, is_active: true, ...hourPayload });
      // Record the first check-in so the timer starts from now.
      await api.checkIn();
    },
    onSuccess: () => onNext(),
    onError: (err) => {
      toast({ title: err instanceof APIError ? err.message : "Failed to save", variant: "destructive" });
    },
  });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-text-primary">Set up your switch</h2>
        <p className="text-sm text-text-secondary mt-1">
          How often do you want to check in? If you miss a check-in, your beneficiaries will be notified after a reminder window.
        </p>
      </div>

      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
        <NumberInput
          label="Check-in every (days)"
          hint="Recommended: 7–30 days. You can always change this later."
          suggestions={[1, 2, 3, 5, 7, 10, 14, 21, 30, 60, 90, 180, 365]}
          error={errors.check_in_interval_days?.message}
          {...register("check_in_interval_days")}
        />
        <div className="space-y-1">
          <label className="text-xs font-medium text-text-secondary">Preferred check-in time (optional)</label>
          <select
            value={preferredHour}
            onChange={(e) => setPreferredHour(e.target.value)}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="">Any time — no preference</option>
            {hourOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <p className="text-xs text-text-muted">Deadlines will be set to this hour each day.</p>
        </div>

        <div className="bg-surface-muted rounded-lg p-3 text-xs text-text-secondary space-y-1">
          <p>With the default settings, if you miss a check-in:</p>
          <ol className="list-decimal list-inside space-y-0.5 pl-1">
            <li>You&apos;ll receive a first reminder 2 days before the deadline</li>
            <li>A second reminder 12 hours before</li>
            <li>A final warning 2 hours before</li>
            <li>After triggering, you have 12 hours to abort delivery</li>
          </ol>
          <p className="pt-1 text-text-muted">All timing can be customized in Settings.</p>
        </div>

        <div className="flex gap-2">
          <Button type="button" variant="ghost" className="flex-1" onClick={onSkip}>
            Use defaults
          </Button>
          <Button type="submit" className="flex-1 gap-1" loading={mutation.isPending}>
            Activate switch <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}

function MFAStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const { user, accessToken, setAuth } = useAuthStore();
  const [phase, setPhase] = useState<"intro" | "setup" | "backup-codes">("intro");
  const [setupData, setSetupData] = useState<{ secret: string; otp_url: string; backup_codes: string[] } | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [code, setCode] = useState("");

  const setupMutation = useMutation({
    mutationFn: () => api.setupMFA(),
    onSuccess: (data) => {
      setSetupData(data);
      setQrUrl(`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(data.otp_url)}`);
      setPhase("setup");
    },
    onError: (err) => {
      toast({ title: err instanceof APIError ? err.message : "Failed to start MFA setup", variant: "destructive" });
    },
  });

  const verifyMutation = useMutation({
    mutationFn: () => api.verifyMFA({ secret: setupData!.secret, code, backup_codes: setupData!.backup_codes }),
    onSuccess: () => setPhase("backup-codes"),
    onError: (err) => {
      toast({ title: err instanceof APIError ? err.message : "Invalid code — try again", variant: "destructive" });
    },
  });

  const handleDone = () => {
    if (user) setAuth({ ...user, mfa_enabled: true }, accessToken ?? "");
    toast({ title: "Two-factor authentication enabled", variant: "success" });
    onNext();
  };

  if (phase === "setup" && setupData) {
    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-xl font-semibold text-text-primary">Set up two-factor authentication</h2>
          <p className="text-sm text-text-secondary mt-1">
            Scan this QR code with your authenticator app (e.g. Authy, 1Password, Google Authenticator), then enter the 6-digit code to confirm.
          </p>
        </div>
        <div className="flex flex-col items-center gap-3">
          {qrUrl && <img src={qrUrl} alt="MFA QR code" className="rounded-lg border border-border w-[180px] h-[180px]" />}
          <div className="text-center">
            <p className="text-xs text-text-muted mb-1">Or enter this code manually:</p>
            <code className="text-xs bg-surface-muted px-3 py-1.5 rounded font-mono tracking-widest">{setupData.secret}</code>
          </div>
        </div>
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
          <Button onClick={() => verifyMutation.mutate()} loading={verifyMutation.isPending} disabled={code.length !== 6}>
            Verify
          </Button>
        </div>
        <button onClick={onSkip} className="text-xs text-text-muted hover:text-text-secondary underline underline-offset-2 block w-full text-center">
          Skip — I&apos;ll set this up later in Settings
        </button>
      </div>
    );
  }

  if (phase === "backup-codes" && setupData) {
    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-xl font-semibold text-text-primary">Save your backup codes</h2>
          <p className="text-sm text-text-secondary mt-1">
            Store these somewhere safe. Each code can be used once if you lose access to your authenticator app.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-1.5 bg-surface-muted rounded-lg p-3">
          {setupData.backup_codes.map((c) => (
            <code key={c} className="text-xs font-mono text-text-primary text-center py-0.5">{c}</code>
          ))}
        </div>
        <Button onClick={handleDone} className="w-full gap-1">
          I&apos;ve saved these codes <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="h-14 w-14 rounded-full bg-primary-50 flex items-center justify-center mx-auto">
        <ShieldCheck className="h-7 w-7 text-primary" />
      </div>
      <div className="text-center">
        <h2 className="text-xl font-semibold text-text-primary">Secure your account</h2>
        <p className="text-sm text-text-secondary mt-2">
          Two-factor authentication adds a second layer of protection. Even if your password is compromised, your account stays safe.
        </p>
      </div>
      <div className="bg-surface-muted rounded-lg p-3 text-xs text-text-secondary space-y-1">
        <p className="font-medium text-text-primary">We strongly recommend this.</p>
        <p>Your vault protects everything important — a strong password alone isn&apos;t always enough.</p>
      </div>
      <Button onClick={() => setupMutation.mutate()} loading={setupMutation.isPending} className="w-full gap-1">
        Set up two-factor auth <ArrowRight className="h-4 w-4" />
      </Button>
      <button onClick={onSkip} className="text-xs text-text-muted hover:text-text-secondary underline underline-offset-2 block w-full text-center">
        Skip — I&apos;ll set this up later in Settings
      </button>
    </div>
  );
}

function RecoveryKeyStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const { data: branding } = useQuery({ queryKey: ["branding"], queryFn: () => api.getBranding(), staleTime: Infinity });
  const appName = branding?.app_name || "P.S. Vault";
  const [phase, setPhase] = useState<"intro" | "show" | "confirm">("intro");
  const [mnemonic, setMnemonic] = useState<string>("");
  const [revealed, setRevealed] = useState(false);
  const [confirmWord, setConfirmWord] = useState("");
  const [confirmIndex, setConfirmIndex] = useState(0);

  const generate = () => {
    const m = generateRecoveryMnemonic();
    const words = m.split(" ");
    setMnemonic(m);
    setConfirmIndex(Math.floor(Math.random() * words.length));
    setRevealed(false);
    setConfirmWord("");
    setPhase("show");
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!validateRecoveryMnemonic(mnemonic)) throw new Error("Invalid recovery key");
      const mek = getMEK();
      if (!mek) throw new Error("Session expired. Please sign in again.");
      const envelope = await wrapMEKWithRecoveryKey(mek, mnemonic);
      await api.setRecoveryKey(envelope);
    },
    onSuccess: () => {
      toast({ title: "Recovery key saved", variant: "success" });
      onNext();
    },
    onError: (err) => {
      toast({ title: err instanceof APIError ? err.message : (err as Error).message, variant: "destructive" });
    },
  });

  const words = mnemonic ? mnemonic.split(" ") : [];
  const expectedWord = words[confirmIndex] ?? "";
  const confirmCorrect = confirmWord.trim().toLowerCase() === expectedWord;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-text-primary">Save your recovery key</h2>
        <p className="text-sm text-text-secondary mt-1">
          If you ever forget your password, this 24-word key is the only way to recover your account. Write it down and store it somewhere safe.
        </p>
      </div>

      {phase === "intro" && (
        <div className="text-center space-y-4">
          <div className="h-12 w-12 rounded-full bg-primary-50 flex items-center justify-center mx-auto">
            <KeyRound className="h-6 w-6 text-primary" />
          </div>
          <p className="text-sm text-text-secondary">
            Generate a unique 24-word recovery key. Write it down before continuing — you won&apos;t be able to copy it after leaving this screen.
          </p>
          <Button onClick={generate} className="w-full">
            Generate recovery key
          </Button>
          <button
            className="text-xs text-text-muted hover:text-text-secondary underline underline-offset-2 block w-full"
            onClick={onSkip}
          >
            Skip — I&apos;ll set this up later in Settings
          </button>
        </div>
      )}

      {phase === "show" && (
        <div className="space-y-4">
          <div className="relative">
            <div
              className={cn(
                "font-mono text-xs leading-relaxed bg-surface-muted rounded-lg p-4 transition-all",
                !revealed && "blur-sm select-none"
              )}
            >
              {words.map((word, i) => (
                <span key={i} className="inline-block mr-2 mb-1">
                  <span className="text-text-muted">{i + 1}.</span> {word}
                </span>
              ))}
            </div>
            {!revealed && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Button variant="outline" size="sm" onClick={() => setRevealed(true)} className="gap-2">
                  <Eye className="h-4 w-4" /> Reveal key
                </Button>
              </div>
            )}
          </div>

          {revealed && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => {
                const formatted = words
                  .map((w, i) => `${String(i + 1).padStart(2, " ")}. ${w}`)
                  .join("\n");
                navigator.clipboard.writeText(`${appName} Recovery Key\n\n${formatted}`);
                toast({ title: "Copied to clipboard" });
              }}
            >
              <Copy className="h-3.5 w-3.5" /> Copy all words
            </Button>
          )}

          <div className="flex gap-2">
            <Button type="button" variant="ghost" className="flex-1" onClick={onSkip}>
              Skip for now
            </Button>
            <Button
              className="flex-1"
              disabled={!revealed}
              onClick={() => setPhase("confirm")}
            >
              I&apos;ve saved these words
            </Button>
          </div>
        </div>
      )}

      {phase === "confirm" && (
        <div className="space-y-4">
          <div className="bg-surface-muted rounded-lg p-3 space-y-2">
            <p className="text-xs font-medium text-text-primary">
              Confirm word #{confirmIndex + 1} to verify you&apos;ve written it down:
            </p>
            <input
              type="text"
              value={confirmWord}
              onChange={(e) => setConfirmWord(e.target.value)}
              placeholder={`Word #${confirmIndex + 1}`}
              spellCheck={false}
              autoComplete="off"
              autoFocus
              className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex gap-2">
            <Button type="button" variant="ghost" className="flex-1" onClick={() => setPhase("show")}>
              Back
            </Button>
            <Button
              className="flex-1 gap-1"
              disabled={!confirmCorrect}
              loading={mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              Save &amp; continue <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function DoneStep({ onFinish }: { onFinish: () => void }) {
  return (
    <div className="text-center space-y-5">
      <div className="h-14 w-14 rounded-full bg-success-50 flex items-center justify-center mx-auto">
        <CheckCircle2 className="h-7 w-7 text-success-600" />
      </div>
      <div>
        <h2 className="text-xl font-semibold text-text-primary">You&apos;re all set.</h2>
        <p className="text-sm text-text-secondary mt-2">
          Your vault is configured. You can always add more vaults, update your beneficiaries, or adjust your switch timing in Settings.
        </p>
      </div>

      <div className="space-y-2 text-left bg-surface-muted rounded-lg p-4">
        {[
          { icon: Key,   text: "Share your vault access key with your beneficiary privately — without it, they can't unlock your vault." },
          { icon: Bell,  text: "Check in regularly to keep your switch active." },
          { icon: Lock,  text: "Your beneficiaries only receive access if the switch triggers." },
        ].map(({ icon: Icon, text }) => (
          <div key={text} className="flex items-start gap-3">
            <Icon className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
            <p className="text-xs text-text-secondary">{text}</p>
          </div>
        ))}
      </div>

      <Button onClick={onFinish} className="w-full">
        Go to dashboard
      </Button>
    </div>
  );
}
