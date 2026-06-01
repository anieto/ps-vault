"use client";

import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams, useRouter } from "next/navigation";
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
  ChevronDown,
  Key,
  ShieldCheck,
  Phone,
  Bell,
  Ban,
  HeartPulse,
  Skull,
  CheckCircle2,
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
import { cn } from "@/lib/utils";
import type { Beneficiary, Vault, TrustedContact } from "@/types";

// ─── Tab navigation ────────────────────────────────────────────────────────

type Tab = "beneficiaries" | "trusted-contacts";

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <div className="flex gap-1 rounded-lg border border-border bg-surface-muted p-1 w-fit">
      {(
        [
          { id: "beneficiaries", label: "Beneficiaries", icon: Users },
          { id: "trusted-contacts", label: "Trusted Contacts", icon: ShieldCheck },
        ] as { id: Tab; label: string; icon: React.ElementType }[]
      ).map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={cn(
            "flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-colors",
            active === id
              ? "bg-surface text-text-primary shadow-sm"
              : "text-text-muted hover:text-text-secondary"
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}

// ─── Photo crop dialog ─────────────────────────────────────────────────────

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
  ctx.drawImage(image, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, size, size);
  return canvas.toDataURL("image/jpeg", 0.8);
}

function PhotoCropDialog({ imageSrc, onCancel, onCrop }: {
  imageSrc: string;
  onCancel: () => void;
  onCrop: (dataUrl: string) => void;
}) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const onCropComplete = useCallback((_: Area, pixels: Area) => setCroppedAreaPixels(pixels), []);

  async function handleConfirm() {
    if (!croppedAreaPixels) return;
    onCrop(await getCroppedImg(imageSrc, croppedAreaPixels));
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="relative flex-1">
        <Cropper image={imageSrc} crop={crop} zoom={zoom} aspect={1} cropShape="round"
          showGrid={false} onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={onCropComplete} />
      </div>
      <div className="flex flex-col gap-3 px-6 py-5 bg-black/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <span className="text-white/60 text-xs w-10">Zoom</span>
          <input type="range" min={1} max={3} step={0.01} value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))} className="flex-1 accent-white" />
        </div>
        <div className="flex gap-3">
          <button onClick={onCancel}
            className="flex-1 rounded-lg border border-white/20 py-2.5 text-sm text-white/80 hover:bg-white/10 transition-colors">
            Cancel
          </button>
          <button onClick={handleConfirm}
            className="flex-1 rounded-lg bg-white py-2.5 text-sm font-semibold text-black hover:bg-white/90 transition-colors">
            Use Photo
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Beneficiaries tab ─────────────────────────────────────────────────────

const addBeneficiarySchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  email: z.string().email("Please enter a valid email address"),
  relationship: z.string().max(100).optional(),
  secret_question: z.string().max(200).optional(),
});
type AddBeneficiaryForm = z.infer<typeof addBeneficiarySchema>;

function BeneficiariesTab() {
  const [showAdd, setShowAdd] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["beneficiaries"],
    queryFn: () => api.listBeneficiaries() as Promise<Beneficiary[]>,
  });
  const beneficiaries = data ?? [];

  return (
    <div className="space-y-4">
      {/* Persistent explainer */}
      <div className="rounded-lg border border-border bg-surface-muted/60 px-4 py-3.5 space-y-2.5">
        <p className="text-xs font-semibold text-text-primary uppercase tracking-wide">What is a beneficiary?</p>
        <p className="text-xs text-text-secondary leading-relaxed">
          Beneficiaries are people who <span className="font-medium text-text-primary">receive access to your vaults</span> after
          your Emergency Switch triggers. Each beneficiary gets their own encrypted access key — you share it with them privately
          and it&apos;s never stored on our servers. You control exactly which vaults each person can access.
        </p>
        <p className="text-xs text-text-muted">
          If you also want someone to be notified or intervene before delivery happens, add them as a trusted contact too.
        </p>
      </div>

      <div className="flex items-center justify-end">
        <Button onClick={() => setShowAdd(true)} className="gap-2" size="sm">
          <Plus className="h-4 w-4" /> Add beneficiary
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
          {beneficiaries.map((b) => <BeneficiaryCard key={b.id} beneficiary={b} />)}
        </div>
      )}

      {beneficiaries.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-border bg-surface-muted px-4 py-3">
          <Info className="h-4 w-4 text-text-muted flex-shrink-0 mt-0.5" />
          <p className="text-xs text-text-secondary leading-relaxed">
            <span className="font-semibold">Next step:</span> Open each vault and click{" "}
            <span className="font-semibold">Grant access</span> to assign a beneficiary and set their access key.
            Share the key with them privately — in person, a letter, or a secure message.
          </p>
        </div>
      )}
    </div>
  );
}

function AddBeneficiaryForm({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const queryClient = useQueryClient();
  const [photoData, setPhotoData] = useState<string | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const { register, handleSubmit, formState: { errors }, watch } = useForm<AddBeneficiaryForm>({
    resolver: zodResolver(addBeneficiarySchema),
  });
  const nameValue = watch("name") ?? "";
  const emailValue = (watch("email") ?? "").trim().toLowerCase();

  const trustedContacts = (queryClient.getQueryData<TrustedContact[]>(["trusted-contacts"]) ?? []);
  const alreadyTrustedContact = emailValue.length > 4 && trustedContacts.some(
    (tc) => tc.email.toLowerCase() === emailValue
  );

  const mutation = useMutation({
    mutationFn: (data: AddBeneficiaryForm) => api.createBeneficiary({
      name: data.name, email: data.email,
      relationship: data.relationship,
      secret_question: data.secret_question || undefined,
      photo_data: photoData ?? undefined,
    }),
    onSuccess: () => { toast({ title: "Beneficiary added.", variant: "success" }); onAdded(); },
    onError: (err) => {
      toast({ title: err instanceof APIError ? err.message : "Failed to add", variant: "destructive" });
    },
  });

  function handlePhotoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCropSrc(URL.createObjectURL(file));
    e.target.value = "";
  }

  return (
    <>
      {cropSrc && (
        <PhotoCropDialog imageSrc={cropSrc}
          onCancel={() => { URL.revokeObjectURL(cropSrc); setCropSrc(null); }}
          onCrop={(dataUrl) => { URL.revokeObjectURL(cropSrc); setCropSrc(null); setPhotoData(dataUrl); }} />
      )}
      <Card>
        <CardContent className="pt-5">
          <h2 className="text-base font-medium text-text-primary mb-1">Add a beneficiary</h2>
          <p className="text-xs text-text-muted mb-4">You can assign vaults to them after adding.</p>
          <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
            <div className="flex items-center gap-4">
              <button type="button" onClick={() => photoInputRef.current?.click()}
                className="relative h-14 w-14 rounded-full bg-primary-50 flex items-center justify-center flex-shrink-0 group overflow-hidden">
                {photoData
                  ? <img src={photoData} alt="Contact" className="h-full w-full object-cover" /> // eslint-disable-line @next/next/no-img-element
                  : <span className="text-lg font-semibold text-primary">{nameValue.charAt(0).toUpperCase() || "?"}</span>}
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera className="h-5 w-5 text-white" />
                </div>
              </button>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1">
                <Input label="Full name" placeholder="Jane Smith" error={errors.name?.message} {...register("name")} />
                <Input label="Email address" type="email" placeholder="jane@example.com" error={errors.email?.message} {...register("email")} />
              </div>
            </div>
            <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoFile} />
            <Input label="Relationship" placeholder="e.g. Spouse, Child, Trusted friend" error={errors.relationship?.message} {...register("relationship")} />
            <Input label="Access key hint (optional)"
              placeholder="e.g. The name of our family dog"
              hint="Shown on the portal to remind them what access key to enter. Do not write the key itself here."
              error={errors.secret_question?.message} {...register("secret_question")} />
            {alreadyTrustedContact && (
              <div className="flex items-start gap-2.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5">
                <Info className="h-3.5 w-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800 leading-relaxed">
                  This person is already a trusted contact. You can add them as a beneficiary too — they&apos;re separate roles.
                </p>
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
              <Button type="submit" loading={mutation.isPending}>Add beneficiary</Button>
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
  const [changeKeyVaultId, setChangeKeyVaultId] = useState<string | null>(null);
  const [newAccessKey, setNewAccessKey] = useState("");
  const [isChangingKey, setIsChangingKey] = useState(false);
  const [changeKeyError, setChangeKeyError] = useState("");

  const { data: assignedVaultsData, refetch: refetchVaults } = useQuery({
    queryKey: ["beneficiary-vaults", b.id],
    queryFn: () => api.getBeneficiaryVaults(b.id) as Promise<Vault[]>,
    enabled: showVaultAccess,
  });
  const assignedVaults = assignedVaultsData ?? [];

  const { data: allVaultsData } = useQuery({
    queryKey: ["vaults"],
    queryFn: () => api.listVaults(),
    enabled: showGrantForm,
  });
  const allVaults = allVaultsData ?? [];
  const assignedVaultIds = new Set(assignedVaults.map((v) => v.id));
  const availableVaults = allVaults.filter((v) => !assignedVaultIds.has(v.id));

  const removeAccessMutation = useMutation({
    mutationFn: (vaultId: string) => api.removeVaultBeneficiary(vaultId, b.id),
    onSuccess: () => { toast({ title: "Vault access removed" }); void refetchVaults(); },
    onError: (err) => toast({ title: err instanceof APIError ? err.message : "Failed to remove", variant: "destructive" }),
  });

  async function handleGrant() {
    if (!grantVaultId || !grantAccessKey.trim()) return;
    setIsGranting(true); setGrantError("");
    try {
      const vault = allVaults.find((v) => v.id === grantVaultId);
      if (!vault) throw new Error("Vault not found");
      const mek = await getMEK();
      if (!mek) throw new Error("Session expired. Please log in again.");
      const cek = await unwrapCEK(vault.cek_envelope, mek);
      const envelope = await wrapCEKForBeneficiary(cek, grantAccessKey.trim());
      await api.assignBeneficiaryToVault(grantVaultId, { beneficiary_id: b.id, beneficiary_cek_envelope: envelope });
      toast({ title: "Vault access granted", variant: "success" });
      setShowGrantForm(false); setGrantVaultId(""); setGrantAccessKey("");
      void refetchVaults();
    } catch (err) {
      setGrantError(err instanceof APIError ? err.message : "Failed to grant access.");
    } finally { setIsGranting(false); }
  }

  async function handleChangeKey(vault: Vault) {
    if (!newAccessKey.trim()) return;
    setIsChangingKey(true); setChangeKeyError("");
    try {
      const mek = getMEK();
      if (!mek) throw new Error("Session expired. Please log in again.");
      const cek = await unwrapCEK(vault.cek_envelope, mek);
      const envelope = await wrapCEKForBeneficiary(cek, newAccessKey.trim());
      await api.assignBeneficiaryToVault(vault.id, { beneficiary_id: b.id, beneficiary_cek_envelope: envelope });
      toast({ title: "Access key updated", variant: "success" });
      setChangeKeyVaultId(null); setNewAccessKey("");
    } catch (err) {
      setChangeKeyError(err instanceof APIError ? err.message : "Failed to update access key.");
    } finally { setIsChangingKey(false); }
  }

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteBeneficiary(b.id),
    onSuccess: () => { toast({ title: "Beneficiary removed" }); queryClient.invalidateQueries({ queryKey: ["beneficiaries"] }); },
    onError: (err) => toast({ title: err instanceof APIError ? err.message : "Failed to remove", variant: "destructive" }),
  });

  const resendMutation = useMutation({
    mutationFn: () => api.resendBeneficiaryConfirmation(b.id),
    onSuccess: () => toast({ title: "Invitation resent", variant: "success" }),
    onError: (err) => toast({ title: err instanceof APIError ? err.message : "Failed to resend", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: () => api.updateBeneficiary(b.id, {
      name: name.trim(), email: email.trim(),
      relationship: relationship.trim() || undefined,
      secret_question: secretQuestion.trim() || undefined,
      photo_data: photoData ?? undefined,
    }),
    onSuccess: () => {
      toast({ title: "Beneficiary updated", variant: "success" });
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ["beneficiaries"] });
    },
    onError: (err) => toast({ title: err instanceof APIError ? err.message : "Failed to update", variant: "destructive" }),
  });

  function handlePhotoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCropSrc(URL.createObjectURL(file));
    e.target.value = "";
  }

  if (editing) {
    return (
      <>
        {cropSrc && (
          <PhotoCropDialog imageSrc={cropSrc}
            onCancel={() => { URL.revokeObjectURL(cropSrc); setCropSrc(null); }}
            onCrop={(dataUrl) => { URL.revokeObjectURL(cropSrc); setCropSrc(null); setPhotoData(dataUrl); }} />
        )}
        <div className="rounded-lg border border-border bg-surface px-4 py-4 space-y-3">
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => photoInputRef.current?.click()}
              className="relative h-14 w-14 rounded-full bg-primary-50 flex items-center justify-center flex-shrink-0 group overflow-hidden">
              {photoData
                ? <img src={photoData} alt="Contact" className="h-full w-full object-cover" /> // eslint-disable-line @next/next/no-img-element
                : <span className="text-lg font-semibold text-primary">{name.charAt(0).toUpperCase()}</span>}
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera className="h-5 w-5 text-white" />
              </div>
            </button>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
              <Input label="Full name" value={name} onChange={(e) => setName(e.target.value)} />
              <Input label="Email address" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoFile} />
          <Input label="Relationship" value={relationship} onChange={(e) => setRelationship(e.target.value)} placeholder="e.g. Spouse, Child" />
          <Input label="Access key hint (optional)" value={secretQuestion}
            onChange={(e) => setSecretQuestion(e.target.value)}
            placeholder="e.g. The name of our family dog"
            hint="Shown on the portal to remind them what access key to enter. Do not write the key itself here." />
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
            {photoData
              ? <img src={photoData} alt={b.name} className="h-full w-full object-cover" /> // eslint-disable-line @next/next/no-img-element
              : <span className="text-sm font-semibold text-primary">{b.name.charAt(0).toUpperCase()}</span>}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-text-primary truncate">{b.name}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Mail className="h-3 w-3 text-text-muted flex-shrink-0" />
              <span className="text-xs text-text-muted truncate">{b.email}</span>
            </div>
            {b.relationship && <span className="text-xs text-text-muted">{b.relationship}</span>}
            <button
              className="flex items-center gap-1 mt-1 text-xs text-text-secondary hover:text-text-primary transition-colors"
              onClick={() => { setShowVaultAccess((v) => !v); if (showVaultAccess) { setShowGrantForm(false); setGrantError(""); } }}
            >
              <Lock className="h-3 w-3 flex-shrink-0" />
              <span>Vault access</span>
              <ChevronDown className={`h-3 w-3 transition-transform ${showVaultAccess ? "rotate-180" : ""}`} />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-surface-muted text-text-muted">
            {b.email_confirmed
              ? <><CheckCircle2 className="h-3 w-3 text-success-600" /> Confirmed</>
              : <><MailCheck className="h-3 w-3" /> Invited</>}
          </span>
          <Button size="icon" variant="ghost" className="h-8 w-8" title="Edit" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" title="Resend invitation"
            loading={resendMutation.isPending} onClick={() => resendMutation.mutate()}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost"
            className="h-8 w-8 text-text-muted hover:text-destructive hover:bg-destructive-50"
            title="Remove beneficiary" loading={deleteMutation.isPending}
            onClick={() => { if (confirm(`Remove ${b.name} as a beneficiary?`)) deleteMutation.mutate(); }}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {showVaultAccess && (
        <div className="border-t border-border px-4 py-3 space-y-2">
          <p className="text-xs font-medium text-text-muted uppercase tracking-wide">Vault access</p>
          {assignedVaults.length === 0
            ? <p className="text-xs text-text-muted">No vault access granted yet.</p>
            : (
              <div className="space-y-2">
                {assignedVaults.map((vault) => (
                  <div key={vault.id}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-base leading-none">{vault.icon}</span>
                        <span className="text-sm text-text-primary">{vault.name}</span>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-text-muted hover:text-text-primary"
                          title={`Change access key for "${vault.name}"`}
                          onClick={() => { setChangeKeyVaultId(changeKeyVaultId === vault.id ? null : vault.id); setNewAccessKey(""); setChangeKeyError(""); }}>
                          <Key className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-text-muted hover:text-destructive"
                          title={`Remove ${b.name}'s access to "${vault.name}"`}
                          loading={removeAccessMutation.isPending}
                          onClick={() => { if (confirm(`Remove ${b.name}'s access to "${vault.name}"?`)) removeAccessMutation.mutate(vault.id); }}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    {changeKeyVaultId === vault.id && (
                      <div className="mt-2 pl-6 space-y-2">
                        <input type="password" placeholder="New access key"
                          className="w-full text-sm rounded-md border border-border bg-surface px-3 py-1.5 text-text-primary outline-none focus:ring-2 focus:ring-primary/30"
                          value={newAccessKey} onChange={(e) => setNewAccessKey(e.target.value)} autoFocus />
                        {changeKeyError && <p className="text-xs text-destructive">{changeKeyError}</p>}
                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm" onClick={() => { setChangeKeyVaultId(null); setNewAccessKey(""); setChangeKeyError(""); }}>Cancel</Button>
                          <Button size="sm" loading={isChangingKey} disabled={!newAccessKey.trim()} onClick={() => handleChangeKey(vault)}>Update key</Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

          {!showGrantForm && (
            <Button variant="ghost" className="h-8 text-xs gap-1.5 px-2 -ml-2 mt-1" onClick={() => setShowGrantForm(true)}>
              <Plus className="h-3.5 w-3.5" /> Grant vault access
            </Button>
          )}

          {showGrantForm && (
            <div className="border border-border rounded-lg px-3 py-3 space-y-3 mt-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-text-secondary">Vault</label>
                <select className="w-full text-sm rounded-md border border-border bg-surface px-3 py-1.5 text-text-primary"
                  value={grantVaultId} onChange={(e) => setGrantVaultId(e.target.value)}>
                  <option value="">Select a vault...</option>
                  {availableVaults.map((vault) => (
                    <option key={vault.id} value={vault.id}>{vault.icon} {vault.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-text-secondary">Access key</label>
                <input type="password" placeholder="The shared passphrase for this beneficiary"
                  className="w-full text-sm rounded-md border border-border bg-surface px-3 py-1.5 text-text-primary outline-none focus:ring-2 focus:ring-primary/30"
                  value={grantAccessKey} onChange={(e) => setGrantAccessKey(e.target.value)} />
              </div>
              {grantError && <p className="text-xs text-destructive">{grantError}</p>}
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={() => { setShowGrantForm(false); setGrantVaultId(""); setGrantAccessKey(""); setGrantError(""); }}>Cancel</Button>
                <Button size="sm" loading={isGranting} disabled={!grantVaultId || !grantAccessKey.trim()} onClick={handleGrant}>Grant access</Button>
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
          <Plus className="h-4 w-4" /> Add your first beneficiary
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Trusted contacts tab ──────────────────────────────────────────────────

function PermissionToggle({ checked, onChange, icon: Icon, label, description }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  icon: React.ElementType;
  label: string;
  description: string;
}) {
  return (
    <button type="button" onClick={() => onChange(!checked)}
      className={`flex items-start gap-3 w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
        checked ? "border-primary bg-primary-50 text-primary-700" : "border-border bg-surface text-text-secondary hover:bg-surface-muted"
      }`}>
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

interface TCFormValues {
  name: string; email: string; phone: string;
  notify_on_final_warning: boolean; can_abort: boolean;
  can_verify_life: boolean; can_corroborate_death: boolean;
}

function defaultTCValues(tc?: TrustedContact): TCFormValues {
  return {
    name: tc?.name ?? "", email: tc?.email ?? "", phone: tc?.phone ?? "",
    notify_on_final_warning: tc?.notify_on_final_warning ?? false,
    can_abort: tc?.can_abort ?? false,
    can_verify_life: tc?.can_verify_life ?? false,
    can_corroborate_death: tc?.can_corroborate_death ?? false,
  };
}

function TCForm({ initial, submitLabel, onSubmit, onCancel, loading, onEmailChange, crossLinkNotice }: {
  initial?: TrustedContact;
  submitLabel: string;
  onSubmit: (v: TCFormValues) => void;
  onCancel: () => void;
  loading: boolean;
  onEmailChange?: (email: string) => void;
  crossLinkNotice?: React.ReactNode;
}) {
  const [values, setValues] = useState<TCFormValues>(defaultTCValues(initial));
  const [errors, setErrors] = useState<Partial<Record<keyof TCFormValues, string>>>({});

  function set<K extends keyof TCFormValues>(key: K, value: TCFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
    if (key === "email") onEmailChange?.(value as string);
  }

  function validate(): boolean {
    const errs: typeof errors = {};
    if (!values.name.trim()) errs.name = "Name is required";
    if (!values.email.trim()) errs.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) errs.email = "Invalid email address";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (validate()) onSubmit(values); }} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input label="Full name" placeholder="Jane Smith" value={values.name}
          onChange={(e) => set("name", e.target.value)} error={errors.name} />
        <Input label="Email address" type="email" placeholder="jane@example.com" value={values.email}
          onChange={(e) => set("email", e.target.value)} error={errors.email} />
      </div>
      <Input label="Phone number (optional)" type="tel" placeholder="+1 555 000 0000"
        value={values.phone} onChange={(e) => set("phone", e.target.value)} />
      <div>
        <p className="text-xs font-medium text-text-secondary mb-2">Permissions</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <PermissionToggle checked={values.notify_on_final_warning} onChange={(v) => set("notify_on_final_warning", v)}
            icon={Bell} label="Notify before trigger"
            description="Receives an email when the final warning fires, before the Emergency Switch triggers." />
          <PermissionToggle checked={values.can_abort} onChange={(v) => set("can_abort", v)}
            icon={Ban} label="Can abort the switch"
            description="Can stop the switch from triggering via a one-time abort link sent to them." />
          <PermissionToggle checked={values.can_verify_life} onChange={(v) => set("can_verify_life", v)}
            icon={HeartPulse} label="Can confirm you're alive"
            description="Can dismiss a beneficiary's death report, stopping the process if you're alive." />
          <PermissionToggle checked={values.can_corroborate_death} onChange={(v) => set("can_corroborate_death", v)}
            icon={Skull} label="Can corroborate a death report"
            description="Their first confirmation reduces the response window from 24 to 12 hours." />
        </div>
      </div>
      {crossLinkNotice}
      <div className="flex gap-2 justify-end pt-1">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" loading={loading}>{submitLabel}</Button>
      </div>
    </form>
  );
}

function TrustedContactCard({ contact: tc }: { contact: TrustedContact }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);

  const updateMutation = useMutation({
    mutationFn: (values: TCFormValues) => api.updateTrustedContact(tc.id, {
      name: values.name.trim(), email: values.email.trim(),
      phone: values.phone.trim() || undefined,
      notify_on_final_warning: values.notify_on_final_warning,
      can_abort: values.can_abort, can_verify_life: values.can_verify_life,
      can_corroborate_death: values.can_corroborate_death,
    }),
    onSuccess: () => {
      toast({ title: "Contact updated", variant: "success" });
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ["trusted-contacts"] });
    },
    onError: (err) => toast({ title: err instanceof APIError ? err.message : "Failed to update", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteTrustedContact(tc.id),
    onSuccess: () => { toast({ title: "Contact removed" }); queryClient.invalidateQueries({ queryKey: ["trusted-contacts"] }); },
    onError: (err) => toast({ title: err instanceof APIError ? err.message : "Failed to remove", variant: "destructive" }),
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
        <TCForm initial={tc} submitLabel="Save changes"
          onSubmit={(values) => updateMutation.mutate(values)}
          onCancel={() => setEditing(false)} loading={updateMutation.isPending} />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex items-start justify-between px-4 py-3.5 gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="h-9 w-9 rounded-full bg-primary-50 flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-semibold text-primary">{tc.name.charAt(0).toUpperCase()}</span>
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
            {activePerms.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {activePerms.map(({ icon: Icon, label }) => (
                  <span key={label} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-primary-50 text-primary-700">
                    <Icon className="h-3 w-3" />{label}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-text-muted mt-1">No permissions granted</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button size="icon" variant="ghost" className="h-8 w-8" title="Edit" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost"
            className="h-8 w-8 text-text-muted hover:text-destructive hover:bg-destructive-50"
            title="Remove contact" loading={deleteMutation.isPending}
            onClick={() => { if (confirm(`Remove ${tc.name} as a trusted contact?`)) deleteMutation.mutate(); }}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function TrustedContactsTab() {
  const [showAdd, setShowAdd] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["trusted-contacts"],
    queryFn: () => api.listTrustedContacts() as Promise<TrustedContact[]>,
  });
  const contacts = data ?? [];

  const beneficiaries = (queryClient.getQueryData<Beneficiary[]>(["beneficiaries"]) ?? []);
  const emailLower = pendingEmail.trim().toLowerCase();
  const alreadyBeneficiary = emailLower.length > 4 && beneficiaries.some(
    (b) => b.email.toLowerCase() === emailLower
  );

  const createMutation = useMutation({
    mutationFn: (values: TCFormValues) => api.createTrustedContact({
      name: values.name.trim(), email: values.email.trim(),
      phone: values.phone.trim() || undefined,
      notify_on_final_warning: values.notify_on_final_warning,
      can_abort: values.can_abort, can_verify_life: values.can_verify_life,
      can_corroborate_death: values.can_corroborate_death,
    }),
    onSuccess: () => {
      toast({ title: "Contact added", variant: "success" });
      setShowAdd(false);
      setPendingEmail("");
      queryClient.invalidateQueries({ queryKey: ["trusted-contacts"] });
    },
    onError: (err) => toast({ title: err instanceof APIError ? err.message : "Failed to add", variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      {/* Persistent explainer */}
      <div className="rounded-lg border border-border bg-surface-muted/60 px-4 py-3.5 space-y-2.5">
        <p className="text-xs font-semibold text-text-primary uppercase tracking-wide">What is a trusted contact?</p>
        <p className="text-xs text-text-secondary leading-relaxed">
          Trusted contacts are people who are <span className="font-medium text-text-primary">notified or can intervene</span> when
          your Emergency Switch fires — but they <span className="font-medium text-text-primary">don&apos;t receive vault access</span>.
          Think of them as overseers who can verify you&apos;re alive, stop a false alarm, or confirm your passing to speed up delivery.
        </p>
        <p className="text-xs text-text-muted">
          The same person can be both a trusted contact and a beneficiary — add them in both tabs if needed.
        </p>
      </div>

      <div className="flex items-center justify-end">
        {!showAdd && (
          <Button onClick={() => setShowAdd(true)} className="gap-2" size="sm">
            <Plus className="h-4 w-4" /> Add contact
          </Button>
        )}
      </div>

      {showAdd && (
        <Card>
          <CardContent className="pt-5">
            <h2 className="text-base font-medium text-text-primary mb-1">Add a trusted contact</h2>
            <p className="text-xs text-text-muted mb-4">
              Choose which actions this person can take. They won&apos;t receive vault contents — use the Beneficiaries tab for that.
            </p>
            <TCForm submitLabel="Add contact"
              onSubmit={(values) => createMutation.mutate(values)}
              onCancel={() => { setShowAdd(false); setPendingEmail(""); }}
              loading={createMutation.isPending}
              onEmailChange={setPendingEmail}
              crossLinkNotice={alreadyBeneficiary && (
                <div className="flex items-start gap-2.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5">
                  <Info className="h-3.5 w-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800 leading-relaxed">
                    This person is already a beneficiary. You can add them as a trusted contact too — they&apos;re separate roles.
                  </p>
                </div>
              )} />
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <ListSkeleton />
      ) : contacts.length === 0 && !showAdd ? (
        <EmptyTrustedContacts onAddClick={() => setShowAdd(true)} />
      ) : (
        <div className="space-y-3">
          {contacts.map((tc) => <TrustedContactCard key={tc.id} contact={tc} />)}
        </div>
      )}
    </div>
  );
}

function EmptyTrustedContacts({ onAddClick }: { onAddClick: () => void }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
        <div className="h-12 w-12 rounded-full bg-primary-50 flex items-center justify-center">
          <ShieldCheck className="h-6 w-6 text-primary" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-text-primary">No trusted contacts yet</p>
          <p className="text-xs text-text-muted mt-1 max-w-sm">
            Optional but recommended — a trusted contact can stop a false alarm or confirm
            your passing to speed up vault delivery.
          </p>
        </div>
        <Button onClick={onAddClick} className="gap-2">
          <Plus className="h-4 w-4" /> Add a trusted contact
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Shared skeleton ───────────────────────────────────────────────────────

function ListSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2].map((i) => <div key={i} className="h-16 rounded-lg skeleton" />)}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function ContactsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const rawTab = searchParams.get("tab");
  const activeTab: Tab = rawTab === "trusted-contacts" ? "trusted-contacts" : "beneficiaries";

  function handleTabChange(tab: Tab) {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "beneficiaries") params.delete("tab");
    else params.set("tab", tab);
    router.replace(`/contacts?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Contacts</h1>
        <p className="text-sm text-text-secondary mt-1">
          Manage the people connected to your vaults and Emergency Switch.
        </p>
      </div>

      <TabBar active={activeTab} onChange={handleTabChange} />

      {activeTab === "beneficiaries" ? <BeneficiariesTab /> : <TrustedContactsTab />}
    </div>
  );
}
