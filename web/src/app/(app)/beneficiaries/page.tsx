"use client";

import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Cropper from "react-easy-crop";
import type { Point, Area } from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";
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
  Lock,
  X,
} from "lucide-react";
import { api, APIError } from "@/lib/api";
import { getMEK, unwrapCEK, wrapCEKForBeneficiary } from "@/lib/crypto";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/components/ui/toaster";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Beneficiary, Vault } from "@/types";

async function getCroppedImg(imageSrc: string, pixelCrop: Area): Promise<string> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = imageSrc;
  });
  const canvas = document.createElement("canvas");
  const size = 256;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(
    image,
    pixelCrop.x, pixelCrop.y,
    pixelCrop.width, pixelCrop.height,
    0, 0, size, size
  );
  return canvas.toDataURL("image/jpeg", 0.8);
}

function PhotoCropDialog({
  imageSrc,
  onCancel,
  onCrop,
}: {
  imageSrc: string;
  onCancel: () => void;
  onCrop: (dataUrl: string) => void;
}) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  async function handleConfirm() {
    if (!croppedAreaPixels) return;
    const dataUrl = await getCroppedImg(imageSrc, croppedAreaPixels);
    onCrop(dataUrl);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="relative flex-1">
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={1}
          cropShape="round"
          showGrid={false}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
        />
      </div>
      <div className="flex flex-col gap-3 px-6 py-5 bg-black/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <span className="text-white/60 text-xs w-10">Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 accent-white"
          />
        </div>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-lg border border-white/20 py-2.5 text-sm text-white/80 hover:bg-white/10 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 rounded-lg bg-white py-2.5 text-sm font-semibold text-black hover:bg-white/90 transition-colors"
          >
            Use Photo
          </button>
        </div>
      </div>
    </div>
  );
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
  const [cropSrc, setCropSrc] = useState<string | null>(null);
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

  function handlePhotoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setCropSrc(url);
    e.target.value = "";
  }

  return (
    <>
    {cropSrc && (
      <PhotoCropDialog
        imageSrc={cropSrc}
        onCancel={() => { URL.revokeObjectURL(cropSrc); setCropSrc(null); }}
        onCrop={(dataUrl) => { URL.revokeObjectURL(cropSrc); setCropSrc(null); setPhotoData(dataUrl); }}
      />
    )}
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
    </>
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
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [showVaultAccess, setShowVaultAccess] = useState(false);
  const [showGrantForm, setShowGrantForm] = useState(false);
  const [grantVaultId, setGrantVaultId] = useState("");
  const [grantAccessKey, setGrantAccessKey] = useState("");
  const [isGranting, setIsGranting] = useState(false);
  const [grantError, setGrantError] = useState("");

  const { data: assignedVaults = [], refetch: refetchVaults } = useQuery({
    queryKey: ["beneficiary-vaults", b.id],
    queryFn: () => api.getBeneficiaryVaults(b.id) as Promise<Vault[]>,
    enabled: showVaultAccess,
  });

  const { data: allVaults = [] } = useQuery({
    queryKey: ["vaults"],
    queryFn: () => api.listVaults(),
    enabled: showGrantForm,
  });

  const assignedVaultIds = new Set(assignedVaults.map((v) => v.id));
  const availableVaults = allVaults.filter((v) => !assignedVaultIds.has(v.id));

  const removeAccessMutation = useMutation({
    mutationFn: (vaultId: string) => api.removeVaultBeneficiary(vaultId, b.id),
    onSuccess: () => {
      toast({ title: "Vault access removed" });
      void refetchVaults();
    },
    onError: (err) => {
      toast({ title: err instanceof APIError ? err.message : "Failed to remove", variant: "destructive" });
    },
  });

  async function handleGrant() {
    if (!grantVaultId || !grantAccessKey.trim()) return;
    setIsGranting(true);
    setGrantError("");
    try {
      const vault = allVaults.find((v) => v.id === grantVaultId);
      if (!vault) throw new Error("Vault not found");
      const mek = await getMEK();
      if (!mek) throw new Error("Session expired. Please log in again.");
      const cek = await unwrapCEK(vault.cek_envelope, mek);
      const envelope = await wrapCEKForBeneficiary(cek, grantAccessKey.trim());
      await api.assignBeneficiaryToVault(grantVaultId, {
        beneficiary_id: b.id,
        beneficiary_cek_envelope: envelope,
      });
      toast({ title: "Vault access granted", variant: "success" });
      setShowGrantForm(false);
      setGrantVaultId("");
      setGrantAccessKey("");
      void refetchVaults();
    } catch (err) {
      setGrantError(err instanceof APIError ? err.message : "Failed to grant access.");
    } finally {
      setIsGranting(false);
    }
  }

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

  function handlePhotoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setCropSrc(url);
    e.target.value = "";
  }

  if (editing) {
    return (
      <>
      {cropSrc && (
        <PhotoCropDialog
          imageSrc={cropSrc}
          onCancel={() => { URL.revokeObjectURL(cropSrc); setCropSrc(null); }}
          onCrop={(dataUrl) => { URL.revokeObjectURL(cropSrc); setCropSrc(null); setPhotoData(dataUrl); }}
        />
      )}
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
      </>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between px-4 py-3.5">
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
          <Button
            size="icon" variant="ghost"
            className={`h-8 w-8 ${showVaultAccess ? "bg-surface-muted" : ""}`}
            title="Manage vault access"
            onClick={() => { setShowVaultAccess((v) => !v); if (showVaultAccess) { setShowGrantForm(false); setGrantError(""); } }}
          >
            <Lock className="h-3.5 w-3.5" />
          </Button>
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

      {showVaultAccess && (
        <div className="border-t border-border px-4 py-3 space-y-2">
          <p className="text-xs font-medium text-text-muted uppercase tracking-wide">Vault access</p>
          {assignedVaults.length === 0 ? (
            <p className="text-xs text-text-muted">No vault access granted yet.</p>
          ) : (
            <div className="space-y-1.5">
              {assignedVaults.map((vault) => (
                <div key={vault.id} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base leading-none">{vault.icon}</span>
                    <span className="text-sm text-text-primary">{vault.name}</span>
                  </div>
                  <Button
                    size="icon" variant="ghost"
                    className="h-7 w-7 text-text-muted hover:text-destructive flex-shrink-0"
                    title={`Remove ${b.name}'s access to "${vault.name}"`}
                    loading={removeAccessMutation.isPending}
                    onClick={() => { if (confirm(`Remove ${b.name}'s access to "${vault.name}"?`)) removeAccessMutation.mutate(vault.id); }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {!showGrantForm && (
            <Button variant="ghost" className="h-8 text-xs gap-1.5 px-2 -ml-2 mt-1" onClick={() => setShowGrantForm(true)}>
              <Plus className="h-3.5 w-3.5" />
              Grant vault access
            </Button>
          )}

          {showGrantForm && (
            <div className="border border-border rounded-lg px-3 py-3 space-y-3 mt-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-text-secondary">Vault</label>
                <select
                  className="w-full text-sm rounded-md border border-border bg-surface px-3 py-1.5 text-text-primary"
                  value={grantVaultId}
                  onChange={(e) => setGrantVaultId(e.target.value)}
                >
                  <option value="">Select a vault...</option>
                  {availableVaults.map((vault) => (
                    <option key={vault.id} value={vault.id}>{vault.icon} {vault.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-text-secondary">Access key</label>
                <input
                  type="password"
                  placeholder="The shared passphrase for this beneficiary"
                  className="w-full text-sm rounded-md border border-border bg-surface px-3 py-1.5 text-text-primary outline-none focus:ring-2 focus:ring-primary/30"
                  value={grantAccessKey}
                  onChange={(e) => setGrantAccessKey(e.target.value)}
                />
              </div>
              {grantError && <p className="text-xs text-destructive">{grantError}</p>}
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={() => { setShowGrantForm(false); setGrantVaultId(""); setGrantAccessKey(""); setGrantError(""); }}>
                  Cancel
                </Button>
                <Button size="sm" loading={isGranting} disabled={!grantVaultId || !grantAccessKey.trim()} onClick={handleGrant}>
                  Grant access
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
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
