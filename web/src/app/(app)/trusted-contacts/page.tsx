"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  ShieldCheck,
  Mail,
  Phone,
  Pencil,
  Trash2,
  Bell,
  Ban,
  HeartPulse,
  Skull,
  Info,
  X,
} from "lucide-react";
import { api, APIError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/components/ui/toaster";
import type { TrustedContact } from "@/types";

// ─── Permission toggle ─────────────────────────────────────────────────────

function PermissionToggle({
  checked,
  onChange,
  icon: Icon,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  icon: React.ElementType;
  label: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`flex items-start gap-3 w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
        checked
          ? "border-primary bg-primary-50 text-primary-700"
          : "border-border bg-surface text-text-secondary hover:bg-surface-muted"
      }`}
    >
      <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${checked ? "text-primary" : "text-text-muted"}`} />
      <div className="min-w-0">
        <p className={`text-xs font-medium ${checked ? "text-primary-700" : "text-text-primary"}`}>{label}</p>
        <p className="text-xs text-text-muted mt-0.5 leading-relaxed">{description}</p>
      </div>
      <div className={`ml-auto flex-shrink-0 h-4 w-4 rounded-sm border mt-0.5 flex items-center justify-center transition-colors ${
        checked ? "bg-primary border-primary" : "border-border"
      }`}>
        {checked && <X className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
      </div>
    </button>
  );
}

// ─── Contact form (shared add/edit) ───────────────────────────────────────

interface ContactFormValues {
  name: string;
  email: string;
  phone: string;
  notify_on_final_warning: boolean;
  can_abort: boolean;
  can_verify_life: boolean;
  can_corroborate_death: boolean;
}

function defaultFormValues(tc?: TrustedContact): ContactFormValues {
  return {
    name: tc?.name ?? "",
    email: tc?.email ?? "",
    phone: tc?.phone ?? "",
    notify_on_final_warning: tc?.notify_on_final_warning ?? false,
    can_abort: tc?.can_abort ?? false,
    can_verify_life: tc?.can_verify_life ?? false,
    can_corroborate_death: tc?.can_corroborate_death ?? false,
  };
}

function ContactForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  loading,
}: {
  initial?: TrustedContact;
  submitLabel: string;
  onSubmit: (values: ContactFormValues) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [values, setValues] = useState<ContactFormValues>(defaultFormValues(initial));
  const [errors, setErrors] = useState<Partial<Record<keyof ContactFormValues, string>>>({});

  function set<K extends keyof ContactFormValues>(key: K, value: ContactFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function validate(): boolean {
    const newErrors: typeof errors = {};
    if (!values.name.trim()) newErrors.name = "Name is required";
    if (!values.email.trim()) newErrors.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) newErrors.email = "Invalid email address";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (validate()) onSubmit(values);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Full name"
          placeholder="Jane Smith"
          value={values.name}
          onChange={(e) => set("name", e.target.value)}
          error={errors.name}
        />
        <Input
          label="Email address"
          type="email"
          placeholder="jane@example.com"
          value={values.email}
          onChange={(e) => set("email", e.target.value)}
          error={errors.email}
        />
      </div>
      <Input
        label="Phone number (optional)"
        type="tel"
        placeholder="+1 555 000 0000"
        value={values.phone}
        onChange={(e) => set("phone", e.target.value)}
      />

      <div>
        <p className="text-xs font-medium text-text-secondary mb-2">Permissions</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <PermissionToggle
            checked={values.notify_on_final_warning}
            onChange={(v) => set("notify_on_final_warning", v)}
            icon={Bell}
            label="Notify before trigger"
            description="Receives an email when the final warning fires, before the Emergency Switch triggers."
          />
          <PermissionToggle
            checked={values.can_abort}
            onChange={(v) => set("can_abort", v)}
            icon={Ban}
            label="Can abort the switch"
            description="Can stop the switch from triggering via a one-time abort link sent to them."
          />
          <PermissionToggle
            checked={values.can_verify_life}
            onChange={(v) => set("can_verify_life", v)}
            icon={HeartPulse}
            label="Can confirm you're alive"
            description="Can dismiss a beneficiary's death report, stopping the process if you're alive."
          />
          <PermissionToggle
            checked={values.can_corroborate_death}
            onChange={(v) => set("can_corroborate_death", v)}
            icon={Skull}
            label="Can corroborate a death report"
            description="Their first confirmation reduces the response window from 24 to 12 hours."
          />
        </div>
      </div>

      <div className="flex gap-2 justify-end pt-1">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={loading}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

// ─── Single contact card ───────────────────────────────────────────────────

function ContactCard({ contact: tc }: { contact: TrustedContact }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);

  const updateMutation = useMutation({
    mutationFn: (values: ContactFormValues) =>
      api.updateTrustedContact(tc.id, {
        name: values.name.trim(),
        email: values.email.trim(),
        phone: values.phone.trim() || undefined,
        notify_on_final_warning: values.notify_on_final_warning,
        can_abort: values.can_abort,
        can_verify_life: values.can_verify_life,
        can_corroborate_death: values.can_corroborate_death,
      }),
    onSuccess: () => {
      toast({ title: "Contact updated", variant: "success" });
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ["trusted-contacts"] });
    },
    onError: (err) => {
      toast({ title: err instanceof APIError ? err.message : "Failed to update", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteTrustedContact(tc.id),
    onSuccess: () => {
      toast({ title: "Contact removed" });
      queryClient.invalidateQueries({ queryKey: ["trusted-contacts"] });
    },
    onError: (err) => {
      toast({ title: err instanceof APIError ? err.message : "Failed to remove", variant: "destructive" });
    },
  });

  const activePerms = [
    tc.notify_on_final_warning && { icon: Bell, label: "Notified before trigger" },
    tc.can_abort && { icon: Ban, label: "Can abort" },
    tc.can_verify_life && { icon: HeartPulse, label: "Can verify life" },
    tc.can_corroborate_death && { icon: Skull, label: "Can corroborate death" },
  ].filter(Boolean) as { icon: React.ElementType; label: string }[];

  if (editing) {
    return (
      <div className="rounded-lg border border-border bg-surface px-4 py-4">
        <h3 className="text-sm font-medium text-text-primary mb-4">Edit trusted contact</h3>
        <ContactForm
          initial={tc}
          submitLabel="Save changes"
          onSubmit={(values) => updateMutation.mutate(values)}
          onCancel={() => setEditing(false)}
          loading={updateMutation.isPending}
        />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex items-start justify-between px-4 py-3.5 gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="h-9 w-9 rounded-full bg-primary-50 flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-semibold text-primary">
              {tc.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-text-primary">{tc.name}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Mail className="h-3 w-3 text-text-muted flex-shrink-0" />
              <span className="text-xs text-text-muted truncate">{tc.email}</span>
            </div>
            {tc.phone && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <Phone className="h-3 w-3 text-text-muted flex-shrink-0" />
                <span className="text-xs text-text-muted">{tc.phone}</span>
              </div>
            )}
            {activePerms.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {activePerms.map(({ icon: Icon, label }) => (
                  <span
                    key={label}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-primary-50 text-primary-700"
                  >
                    <Icon className="h-3 w-3" />
                    {label}
                  </span>
                ))}
              </div>
            )}
            {activePerms.length === 0 && (
              <p className="text-xs text-text-muted mt-1">No permissions granted</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <Button size="icon" variant="ghost" className="h-8 w-8" title="Edit" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-text-muted hover:text-destructive hover:bg-destructive-50"
            title="Remove contact"
            loading={deleteMutation.isPending}
            onClick={() => {
              if (confirm(`Remove ${tc.name} as a trusted contact?`)) deleteMutation.mutate();
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function TrustedContactsPage() {
  const [showAdd, setShowAdd] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["trusted-contacts"],
    queryFn: () => api.listTrustedContacts() as Promise<TrustedContact[]>,
  });

  const contacts = data ?? [];

  const createMutation = useMutation({
    mutationFn: (values: ContactFormValues) =>
      api.createTrustedContact({
        name: values.name.trim(),
        email: values.email.trim(),
        phone: values.phone.trim() || undefined,
        notify_on_final_warning: values.notify_on_final_warning,
        can_abort: values.can_abort,
        can_verify_life: values.can_verify_life,
        can_corroborate_death: values.can_corroborate_death,
      }),
    onSuccess: () => {
      toast({ title: "Contact added", variant: "success" });
      setShowAdd(false);
      queryClient.invalidateQueries({ queryKey: ["trusted-contacts"] });
    },
    onError: (err) => {
      toast({ title: err instanceof APIError ? err.message : "Failed to add contact", variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Trusted Contacts</h1>
          <p className="text-sm text-text-secondary mt-1">
            People who can be notified or take action when your Emergency Switch fires.
          </p>
        </div>
        {!showAdd && (
          <Button onClick={() => setShowAdd(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Add contact
          </Button>
        )}
      </div>

      {showAdd && (
        <Card>
          <CardContent className="pt-5">
            <h2 className="text-base font-medium text-text-primary mb-1">Add a trusted contact</h2>
            <p className="text-xs text-text-muted mb-4">
              Trusted contacts don&apos;t receive vault access — use beneficiaries for that.
            </p>
            <ContactForm
              submitLabel="Add contact"
              onSubmit={(values) => createMutation.mutate(values)}
              onCancel={() => setShowAdd(false)}
              loading={createMutation.isPending}
            />
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <ListSkeleton />
      ) : contacts.length === 0 && !showAdd ? (
        <EmptyState onAddClick={() => setShowAdd(true)} />
      ) : (
        <div className="space-y-3">
          {contacts.map((tc) => (
            <ContactCard key={tc.id} contact={tc} />
          ))}
        </div>
      )}

      {contacts.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-border bg-surface-muted px-4 py-3">
          <Info className="h-4 w-4 text-text-muted flex-shrink-0 mt-0.5" />
          <p className="text-xs text-text-secondary leading-relaxed">
            <span className="font-semibold">Trusted contacts vs. beneficiaries:</span> Trusted
            contacts can be notified or intervene when the Emergency Switch fires — they don&apos;t
            get vault access. To give someone vault access, add them as a beneficiary instead.
          </p>
        </div>
      )}
    </div>
  );
}

function EmptyState({ onAddClick }: { onAddClick: () => void }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-14 gap-4">
        <div className="h-12 w-12 rounded-full bg-primary-50 flex items-center justify-center">
          <ShieldCheck className="h-6 w-6 text-primary" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-text-primary">No trusted contacts yet</p>
          <p className="text-xs text-text-muted mt-1 max-w-xs">
            Add people who should be notified or can take action if your Emergency Switch fires.
            They don&apos;t receive vault access — that&apos;s for beneficiaries.
          </p>
        </div>
        <Button onClick={onAddClick} className="gap-2">
          <Plus className="h-4 w-4" />
          Add your first trusted contact
        </Button>
      </CardContent>
    </Card>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2].map((i) => (
        <div key={i} className="h-20 rounded-lg skeleton" />
      ))}
    </div>
  );
}
