"use client";

import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Users,
  Mail,
  Trash2,
  RefreshCw,
  MailCheck,
  Pencil,
  Info,
  Camera,
} from "lucide-react";
import { api, APIError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/components/ui/toaster";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { cn } from "@/lib/utils";
import type { Beneficiary } from "@/types";

function compressPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const size = 256;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      const scale = Math.max(size / img.width, size / img.height);
      const sw = size / scale;
      const sh = size / scale;
      const sx = (img.width - sw) / 2;
      const sy = (img.height - sh) / 2;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size);
      resolve(canvas.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = reject;
    img.src = url;
  });
}

const addBeneficiarySchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  email: z.string().email("Please enter a valid email address"),
  relationship: z.string().max(100).optional(),
  secret_question: z.string().max(200).optional(),
});

type AddBeneficiaryForm = z.infer<typeof addBeneficiarySchema>;


export default function BeneficiariesPage() {
  const [showAdd, setShowAdd] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["beneficiaries"],
    queryFn: () => api.listBeneficiaries() as Promise<Beneficiary[]>,
  });

  const beneficiaries = data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Beneficiaries</h1>
          <p className="text-sm text-text-secondary mt-1">
            Add as many people as you need — each can receive access to different vaults.
          </p>
        </div>
        <Button onClick={() => setShowAdd(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Add person
        </Button>
      </div>

      {showAdd && (
        <AddBeneficiaryForm
          onClose={() => setShowAdd(false)}
          onAdded={() => {
            setShowAdd(false);
            queryClient.invalidateQueries({ queryKey: ["beneficiaries"] });
          }}
        />
      )}

      {isLoading ? (
        <ListSkeleton />
      ) : beneficiaries.length === 0 && !showAdd ? (
        <EmptyBeneficiaries onAddClick={() => setShowAdd(true)} />
      ) : (
        <div className="space-y-3">
          {beneficiaries.map((b) => (
            <BeneficiaryCard key={b.id} beneficiary={b} />
          ))}
        </div>
      )}

      {beneficiaries.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-border bg-surface-muted px-4 py-3">
          <Info className="h-4 w-4 text-text-muted flex-shrink-0 mt-0.5" />
          <p className="text-xs text-text-secondary leading-relaxed">
            <span className="font-semibold">Next step:</span> Open each vault and click <span className="font-semibold">Grant access</span> to give a beneficiary access. You&apos;ll create a unique access key for each person — keep it somewhere safe and share it with them privately (a letter, a secure note, etc.). You can grant the same vault to multiple people, or give different beneficiaries access to different vaults.
          </p>
        </div>
      )}
    </div>
  );
}

function AddBeneficiaryForm({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: () => void;
}) {
  const [photoData, setPhotoData] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<AddBeneficiaryForm>({
    resolver: zodResolver(addBeneficiarySchema),
  });

  const nameValue = watch("name") ?? "";

  const mutation = useMutation({
    mutationFn: (data: AddBeneficiaryForm) =>
      api.createBeneficiary({
        name: data.name,
        email: data.email,
        relationship: data.relationship,
        secret_question: data.secret_question || undefined,
        photo_data: photoData ?? undefined,
      }),
    onSuccess: () => {
      toast({ title: "Beneficiary added.", variant: "success" });
      onAdded();
    },
    onError: (err) => {
      const msg = err instanceof APIError ? err.message : "Failed to add beneficiary";
      toast({ title: msg, variant: "destructive" });
    },
  });

  async function handlePhotoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressPhoto(file);
      setPhotoData(compressed);
    } catch {
      toast({ title: "Failed to process image", variant: "destructive" });
    }
  }

  return (
    <Card>
      <CardContent className="pt-5">
        <h2 className="text-base font-medium text-text-primary mb-1">Add a beneficiary</h2>
        <p className="text-xs text-text-muted mb-4">
          You can assign vaults to them after adding.
        </p>
        <form
          onSubmit={handleSubmit((d) => mutation.mutate(d))}
          className="space-y-4"
        >
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              className="relative h-14 w-14 rounded-full bg-primary-50 flex items-center justify-center flex-shrink-0 group overflow-hidden"
              title="Upload photo"
            >
              {photoData ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoData} alt="Contact" className="h-full w-full object-cover" />
              ) : (
                <span className="text-lg font-semibold text-primary">
                  {nameValue.charAt(0).toUpperCase() || "?"}
                </span>
              )}
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera className="h-5 w-5 text-white" />
              </div>
            </button>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1">
              <Input
                label="Full name"
                placeholder="Jane Smith"
                error={errors.name?.message}
                {...register("name")}
              />
              <Input
                label="Email address"
                type="email"
                placeholder="jane@example.com"
                error={errors.email?.message}
                {...register("email")}
              />
            </div>
          </div>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoFile}
          />
          <Input
            label="Relationship"
            placeholder="e.g. Spouse, Child, Trusted friend"
            error={errors.relationship?.message}
            {...register("relationship")}
          />
          <Input
            label="Access key hint (optional)"
            placeholder="e.g. The name of our family dog"
            hint="Shown on the portal to remind them what access key to enter. Do not write the key itself here."
            error={errors.secret_question?.message}
            {...register("secret_question")}
          />
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              Add beneficiary
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function BeneficiaryCard({ beneficiary: b }: { beneficiary: Beneficiary }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(b.name);
  const [email, setEmail] = useState(b.email);
  const [relationship, setRelationship] = useState(b.relationship ?? "");
  const [secretQuestion, setSecretQuestion] = useState(b.secret_question ?? "");
  const [photoData, setPhotoData] = useState<string | null>(b.photo_data ?? null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteBeneficiary(b.id),
    onSuccess: () => {
      toast({ title: "Beneficiary removed" });
      queryClient.invalidateQueries({ queryKey: ["beneficiaries"] });
    },
    onError: (err) => {
      toast({ title: err instanceof APIError ? err.message : "Failed to remove", variant: "destructive" });
    },
  });

  const resendMutation = useMutation({
    mutationFn: () => api.resendBeneficiaryConfirmation(b.id),
    onSuccess: () => toast({ title: "Invitation resent", variant: "success" }),
    onError: (err) => toast({ title: err instanceof APIError ? err.message : "Failed to resend", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: () => api.updateBeneficiary(b.id, {
      name: name.trim(),
      email: email.trim(),
      relationship: relationship.trim() || undefined,
      secret_question: secretQuestion.trim() || undefined,
      photo_data: photoData ?? undefined,
    }),
    onSuccess: () => {
      toast({ title: "Beneficiary updated", variant: "success" });
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ["beneficiaries"] });
    },
    onError: (err) => {
      toast({ title: err instanceof APIError ? err.message : "Failed to update", variant: "destructive" });
    },
  });

  async function handlePhotoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressPhoto(file);
      setPhotoData(compressed);
    } catch {
      toast({ title: "Failed to process image", variant: "destructive" });
    }
  }

  if (editing) {
    return (
      <div className="rounded-lg border border-border bg-surface px-4 py-4 space-y-3">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            className="relative h-14 w-14 rounded-full bg-primary-50 flex items-center justify-center flex-shrink-0 group overflow-hidden"
            title="Upload photo"
          >
            {photoData ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoData} alt="Contact" className="h-full w-full object-cover" />
            ) : (
              <span className="text-lg font-semibold text-primary">
                {name.charAt(0).toUpperCase()}
              </span>
            )}
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Camera className="h-5 w-5 text-white" />
            </div>
          </button>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
            <Input label="Full name" value={name} onChange={(e) => setName(e.target.value)} />
            <Input label="Email address" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handlePhotoFile}
        />
        <Input label="Relationship" value={relationship} onChange={(e) => setRelationship(e.target.value)} placeholder="e.g. Spouse, Child" />
        <Input
          label="Access key hint (optional)"
          value={secretQuestion}
          onChange={(e) => setSecretQuestion(e.target.value)}
          placeholder="e.g. The name of our family dog"
          hint="Shown on the portal to remind them what access key to enter. Do not write the key itself here."
        />
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          <Button loading={updateMutation.isPending} onClick={() => updateMutation.mutate()}>Save changes</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between px-4 py-3.5 rounded-lg border border-border bg-surface">
      <div className="flex items-center gap-3 min-w-0">
        <div className="h-9 w-9 rounded-full bg-primary-50 flex items-center justify-center flex-shrink-0 overflow-hidden">
          {photoData ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoData} alt={b.name} className="h-full w-full object-cover" />
          ) : (
            <span className="text-sm font-semibold text-primary">
              {b.name.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-primary truncate">{b.name}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Mail className="h-3 w-3 text-text-muted flex-shrink-0" />
            <span className="text-xs text-text-muted truncate">{b.email}</span>
          </div>
          {b.relationship && (
            <span className="text-xs text-text-muted">{b.relationship}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0 ml-3">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-surface-muted text-text-muted">
          <MailCheck className="h-3 w-3" />
          Invited
        </span>
        <Button size="icon" variant="ghost" className="h-8 w-8" title="Edit" onClick={() => setEditing(true)}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" title="Resend invitation" loading={resendMutation.isPending} onClick={() => resendMutation.mutate()}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon" variant="ghost"
          className="h-8 w-8 text-text-muted hover:text-destructive hover:bg-destructive-50"
          title="Remove beneficiary"
          loading={deleteMutation.isPending}
          onClick={() => { if (confirm(`Remove ${b.name} as a beneficiary?`)) deleteMutation.mutate(); }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}


function EmptyBeneficiaries({ onAddClick }: { onAddClick: () => void }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-14 gap-4">
        <div className="h-12 w-12 rounded-full bg-primary-50 flex items-center justify-center">
          <Users className="h-6 w-6 text-primary" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-text-primary">No beneficiaries yet</p>
          <p className="text-xs text-text-muted mt-1 max-w-xs">
            Add one or more trusted people. You control which vaults each person can access.
          </p>
        </div>
        <Button onClick={onAddClick} className="gap-2">
          <Plus className="h-4 w-4" />
          Add your first beneficiary
        </Button>
      </CardContent>
    </Card>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2].map((i) => (
        <div key={i} className="h-16 rounded-lg skeleton" />
      ))}
    </div>
  );
}
