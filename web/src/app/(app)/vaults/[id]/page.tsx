"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  Key,
  FileText,
  Globe,
  CreditCard,
  Landmark,
  StickyNote,
  MoreHorizontal,
  Save,
  X,
  ChevronDown,
  ChevronUp,
  UserPlus,
  Mail,
  CheckCircle2,
  Clock,
  Eye,
  Shield,
  Unlock,
  Heart,
  Phone,
  BadgeCheck,
  Star,
  GripVertical,
  History,
  RotateCcw,
  Upload,
  Download,
  FileIcon,
} from "lucide-react";
import { api, APIError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toaster";
import { getMEK, unwrapCEK, encryptObject, decryptObject, wrapCEKForBeneficiary, generateFileKey, encryptBytes, wrapFileKey, unwrapFileKey, decryptBytes } from "@/lib/crypto";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { cn, entryTypeIcon } from "@/lib/utils";
import type { Vault, VaultEntry, EntryType, VaultEntryVersion } from "@/types";

export default function VaultDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [cek, setCek] = useState<Uint8Array | null>(null);
  const [decryptedEntries, setDecryptedEntries] = useState<Record<string, object>>({});
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [editingVault, setEditingVault] = useState(searchParams.get("edit") === "true");
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const [showAssignBeneficiary, setShowAssignBeneficiary] = useState(false);
  const [collapsedVaultGroups, setCollapsedVaultGroups] = useState<Set<string>>(
    () => new Set(VAULT_ENTRY_GROUPS.map((g) => g.type))
  );
  const toggleVaultGroup = (type: string) =>
    setCollapsedVaultGroups((prev) => {
      const next = new Set(prev);
      next.has(type) ? next.delete(type) : next.add(type);
      return next;
    });
  const [deliveryMessage, setDeliveryMessage] = useState<string | null>(null);
  const [editingMessage, setEditingMessage] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [localEntries, setLocalEntries] = useState<VaultEntry[]>([]);
  const dragItemId = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const { data: vault, isLoading } = useQuery({
    queryKey: ["vault", params.id],
    queryFn: () => api.getVault(params.id) as Promise<Vault>,
  });

  const { data: entries } = useQuery({
    queryKey: ["entries", params.id],
    queryFn: () => api.listEntries(params.id) as Promise<VaultEntry[]>,
    enabled: !!vault,
  });

  const { data: vaultBeneficiaries } = useQuery({
    queryKey: ["vault-beneficiaries", params.id],
    queryFn: () => api.getVaultBeneficiaries(params.id),
    enabled: !!vault,
  });

  // Keep localEntries in sync with server data
  useEffect(() => {
    if (entries) setLocalEntries(entries);
  }, [entries]);

  const handleDrop = useCallback(async (groupType: string, targetId: string) => {
    const sourceId = dragItemId.current;
    setDragOverId(null);
    if (!sourceId || sourceId === targetId) return;

    const groupItems = localEntries
      .filter((e) => e.entry_type === groupType)
      .sort((a, b) => (a.is_favorite === b.is_favorite ? a.sort_order - b.sort_order : a.is_favorite ? -1 : 1));

    const sourceIdx = groupItems.findIndex((e) => e.id === sourceId);
    const targetIdx = groupItems.findIndex((e) => e.id === targetId);
    if (sourceIdx === -1 || targetIdx === -1) return;

    const reordered = [...groupItems];
    const [moved] = reordered.splice(sourceIdx, 1);
    reordered.splice(targetIdx, 0, moved);

    const updated = reordered.map((e, i) => ({ ...e, sort_order: i }));
    setLocalEntries((prev) => [
      ...prev.filter((e) => e.entry_type !== groupType),
      ...updated,
    ]);

    for (const item of updated) {
      const original = groupItems.find((e) => e.id === item.id);
      if (original && original.sort_order !== item.sort_order) {
        api.updateEntry(params.id, item.id, { sort_order: item.sort_order }).catch(() => {});
      }
    }
  }, [localEntries, params.id]);

  // Derive CEK from vault envelope
  useEffect(() => {
    if (!vault?.cek_envelope) return;
    const mek = getMEK();
    if (!mek) {
      toast({ title: "Session expired. Please sign in again.", variant: "destructive" });
      router.push("/login");
      return;
    }
    unwrapCEK(vault.cek_envelope, mek)
      .then(async (resolvedCek) => {
        setCek(resolvedCek);
        if (vault.delivery_message_enc) {
          try {
            const { decrypt } = await import("@/lib/crypto");
            const msg = await decrypt(vault.delivery_message_enc, resolvedCek);
            setDeliveryMessage(msg);
          } catch {
            setDeliveryMessage(null);
          }
        }
      })
      .catch(() => {
        toast({ title: "Failed to decrypt vault. Your key may have changed.", variant: "destructive" });
      });
  }, [vault, router]);

  // Decrypt entries as they come in
  useEffect(() => {
    if (!cek || !entries) return;
    const run = async () => {
      const decrypted: Record<string, object> = {};
      for (const entry of entries) {
        try {
          decrypted[entry.id] = await decryptObject(entry.encrypted_data, cek);
        } catch {
          decrypted[entry.id] = { _error: "Could not decrypt" };
        }
      }
      setDecryptedEntries(decrypted);
    };
    run();
  }, [cek, entries]);

  const deleteMutation = useMutation({
    mutationFn: (entryId: string) => api.deleteEntry(params.id, entryId),
    onSuccess: () => {
      toast({ title: "Entry deleted" });
      queryClient.invalidateQueries({ queryKey: ["entries", params.id] });
    },
    onError: (err) => {
      toast({ title: err instanceof APIError ? err.message : "Failed to delete entry", variant: "destructive" });
    },
  });

  if (isLoading || !vault) {
    return <VaultDetailSkeleton />;
  }

  return (
    <>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button asChild variant="ghost" size="icon" className="mt-0.5 flex-shrink-0">
          <Link href="/vaults">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1 min-w-0">
          {editingVault ? (
            <EditVaultForm
              vault={vault}
              onDone={() => {
                setEditingVault(false);
                queryClient.invalidateQueries({ queryKey: ["vault", params.id] });
                queryClient.invalidateQueries({ queryKey: ["vaults"] });
              }}
              onCancel={() => setEditingVault(false)}
            />
          ) : (
            <div className="flex items-start justify-between gap-2">
              <div>
                <h1 className="text-2xl font-semibold text-text-primary">{vault.name}</h1>
                {vault.description && (
                  <p className="text-sm text-text-secondary mt-1">{vault.description}</p>
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {cek && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1.5"
                    onClick={() => setShowPreview(true)}
                  >
                    <Eye className="h-3.5 w-3.5" /> Preview
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1.5"
                  loading={exporting}
                  onClick={async () => {
                    setExporting(true);
                    try {
                      const blob = await api.exportVault(params.id);
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `vault-${vault.name}-${new Date().toISOString().slice(0, 10)}.zip`;
                      a.click();
                      URL.revokeObjectURL(url);
                    } catch {
                      toast({ title: "Export failed", variant: "destructive" });
                    } finally {
                      setExporting(false);
                    }
                  }}
                >
                  <Download className="h-3.5 w-3.5" /> Export
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1.5"
                  onClick={() => setEditingVault(true)}
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delivery message section */}
      {cek && (
        <div>
          <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wide mb-3">
            Message to beneficiaries
          </h2>

          {editingMessage ? (
            <DeliveryMessageForm
              vaultId={params.id}
              cek={cek}
              currentMessage={deliveryMessage}
              onDone={(msg) => {
                setDeliveryMessage(msg);
                setEditingMessage(false);
                queryClient.invalidateQueries({ queryKey: ["vault", params.id] });
              }}
              onCancel={() => setEditingMessage(false)}
            />
          ) : deliveryMessage ? (
            <div className="relative rounded-lg border border-border bg-surface-muted/50 px-4 py-3 pr-10 group">
              <div className="text-sm text-text-primary prose-sm" dangerouslySetInnerHTML={{ __html: deliveryMessage }} />
              <button
                className="absolute top-2.5 right-2.5 p-1 rounded text-text-muted hover:text-text-primary hover:bg-border transition-colors opacity-0 group-hover:opacity-100"
                onClick={() => setEditingMessage(true)}
                title="Edit message"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              className="w-full text-left rounded-lg border border-dashed border-border px-4 py-4 hover:border-primary/50 hover:bg-surface-muted/50 transition-colors group"
              onClick={() => setEditingMessage(true)}
            >
              <p className="text-sm text-text-muted group-hover:text-text-secondary">
                + Add a personal note your beneficiaries will see when they open this vault.
              </p>
            </button>
          )}
        </div>
      )}

      {/* Entries section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wide">
            Contents ({entries?.length ?? 0})
          </h2>
          {!showAddEntry && (
            <Button size="sm" className="gap-1.5" onClick={() => setShowAddEntry(true)}>
              <Plus className="h-3.5 w-3.5" /> Add entry
            </Button>
          )}
        </div>

        {showAddEntry && cek && (
          <AddEntryForm
            vaultId={params.id}
            cek={cek}
            onDone={() => {
              setShowAddEntry(false);
              queryClient.invalidateQueries({ queryKey: ["entries", params.id] });
            }}
            onCancel={() => setShowAddEntry(false)}
          />
        )}

        {!cek && (
          <div className="text-sm text-text-muted text-center py-6">
            Decrypting vault contents…
          </div>
        )}

        {cek && entries?.length === 0 && !showAddEntry && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-10 gap-3">
              <FileText className="h-8 w-8 text-text-muted" />
              <p className="text-sm text-text-secondary text-center">
                This vault is empty. Add entries to store information for your beneficiaries.
              </p>
              <Button size="sm" className="gap-1.5" onClick={() => setShowAddEntry(true)}>
                <Plus className="h-3.5 w-3.5" /> Add first entry
              </Button>
            </CardContent>
          </Card>
        )}

        {cek && localEntries.length > 0 && (() => {
          const grouped = VAULT_ENTRY_GROUPS
            .map((g) => ({ ...g, items: localEntries.filter((e) => e.entry_type === g.type) }))
            .filter((g) => g.items.length > 0);
          const knownTypes = new Set(VAULT_ENTRY_GROUPS.map((g) => g.type));
          const ungrouped = localEntries.filter((e) => !knownTypes.has(e.entry_type));
          if (ungrouped.length > 0) grouped.push({ type: "_other", label: "Other", items: ungrouped });

          return (
            <div className="space-y-2">
              {grouped.map((group) => {
                const isCollapsed = collapsedVaultGroups.has(group.type);
                const sorted = [...group.items].sort((a, b) => {
                  if (a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1;
                  return a.sort_order - b.sort_order;
                });
                return (
                  <div key={group.type} className="rounded-lg border border-border bg-surface overflow-visible">
                    <button
                      className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-surface-muted/50 transition-colors"
                      onClick={() => toggleVaultGroup(group.type)}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-text-muted">
                          {entryTypeIcon(group.type as EntryType)}
                        </span>
                        <span className="text-sm font-semibold text-text-primary">{group.label}</span>
                        <span className="text-xs text-text-muted bg-surface-muted px-2 py-0.5 rounded-full font-medium">
                          {group.items.length}
                        </span>
                      </div>
                      {isCollapsed
                        ? <ChevronDown className="h-4 w-4 text-text-muted flex-shrink-0" />
                        : <ChevronUp className="h-4 w-4 text-text-muted flex-shrink-0" />}
                    </button>
                    {!isCollapsed && (
                      <div className="border-t border-border space-y-0">
                        {sorted.map((entry) => (
                          <div
                            key={entry.id}
                            className={cn(
                              "border-b border-border last:border-b-0 transition-colors",
                              dragOverId === entry.id && "bg-primary/5 border-t-2 border-t-primary/40"
                            )}
                            draggable
                            onDragStart={() => { dragItemId.current = entry.id; }}
                            onDragOver={(e) => { e.preventDefault(); setDragOverId(entry.id); }}
                            onDragLeave={() => setDragOverId(null)}
                            onDrop={() => handleDrop(group.type, entry.id)}
                            onDragEnd={() => { dragItemId.current = null; setDragOverId(null); }}
                          >
                            <EntryCard
                              entry={entry}
                              decrypted={decryptedEntries[entry.id]}
                              expanded={expandedEntry === entry.id}
                              onToggle={() =>
                                setExpandedEntry((prev) => (prev === entry.id ? null : entry.id))
                              }
                              onDelete={() => {
                                if (confirm("Delete this entry? This cannot be undone.")) {
                                  deleteMutation.mutate(entry.id);
                                }
                              }}
                              onUpdate={() => queryClient.invalidateQueries({ queryKey: ["entries", params.id] })}
                              onFavoriteToggle={(newVal) =>
                                setLocalEntries((prev) =>
                                  prev.map((e) => e.id === entry.id ? { ...e, is_favorite: newVal } : e)
                                )
                              }
                              vaultId={params.id}
                              cek={cek}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* Access section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wide">
            Access ({vaultBeneficiaries?.length ?? 0})
          </h2>
          {cek && !showAssignBeneficiary && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowAssignBeneficiary(true)}>
              <UserPlus className="h-3.5 w-3.5" /> Grant access
            </Button>
          )}
        </div>

        {showAssignBeneficiary && cek && (
          <AssignBeneficiaryForm
            vaultId={params.id}
            cek={cek}
            onDone={() => {
              setShowAssignBeneficiary(false);
              queryClient.invalidateQueries({ queryKey: ["vault-beneficiaries", params.id] });
            }}
            onCancel={() => setShowAssignBeneficiary(false)}
          />
        )}

        {vaultBeneficiaries && vaultBeneficiaries.length === 0 && !showAssignBeneficiary && (
          <p className="text-sm text-text-muted py-3">
            No beneficiaries have access to this vault yet.
          </p>
        )}

        {vaultBeneficiaries && vaultBeneficiaries.length > 0 && (
          <div className="space-y-2">
            {vaultBeneficiaries.map((vb) => (
              <VaultBeneficiaryRow
                key={vb.beneficiary_id}
                vaultBeneficiary={vb}
                vaultId={params.id}
                cek={cek}
                onRemoved={() => queryClient.invalidateQueries({ queryKey: ["vault-beneficiaries", params.id] })}
              />
            ))}
          </div>
        )}

        <p className="text-xs text-text-muted mt-3">
          Each beneficiary needs a unique access key that you share with them privately. This key is never sent to our servers.
        </p>
      </div>
    </div>

    {showPreview && vault && cek && (
      <VaultPreviewModal
        vault={vault}
        entries={entries ?? []}
        decryptedEntries={decryptedEntries}
        deliveryMessage={deliveryMessage}
        cek={cek}
        onClose={() => setShowPreview(false)}
      />
    )}
    </>
  );
}

// ---- Edit vault form ----
const editVaultSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(500).optional(),
});

function EditVaultForm({
  vault,
  onDone,
  onCancel,
}: {
  vault: Vault;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(editVaultSchema),
    defaultValues: { name: vault.name, description: vault.description ?? "" },
  });

  const mutation = useMutation({
    mutationFn: (data: { name: string; description?: string }) =>
      api.updateVault(vault.id, data),
    onSuccess: () => {
      toast({ title: "Vault updated", variant: "success" });
      onDone();
    },
    onError: (err) => {
      toast({ title: err instanceof APIError ? err.message : "Update failed", variant: "destructive" });
    },
  });

  return (
    <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-3">
      <Input label="Name" error={errors.name?.message} {...register("name")} />
      <Input label="Description" {...register("description")} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={mutation.isPending} className="gap-1.5">
          <Save className="h-3.5 w-3.5" /> Save
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </form>
  );
}

// ---- Entry group definitions ----
const VAULT_ENTRY_GROUPS = [
  { type: "contact",   label: "Contacts" },
  { type: "login",     label: "Logins" },
  { type: "financial", label: "Financial Accounts" },
  { type: "card",      label: "Cards" },
  { type: "identity",  label: "Identity Documents" },
  { type: "crypto",    label: "Crypto" },
  { type: "file",      label: "Documents" },
  { type: "note",      label: "Notes" },
  { type: "custom",    label: "Other" },
];

// ---- Add entry form ----
const ENTRY_TYPES: { value: EntryType; label: string; icon: React.ReactNode; tooltip: string }[] = [
  { value: "contact",  label: "Contact",      icon: "👤", tooltip: "Important people to reach — doctor, lawyer, work manager, etc." },
  { value: "login",    label: "Login",        icon: "🔑", tooltip: "Website & app credentials — email, streaming, online banking, etc." },
  { value: "financial",label: "Financial",    icon: "🏦", tooltip: "Bank accounts, investments, retirement funds, routing numbers, etc." },
  { value: "card",     label: "Card",         icon: "💳", tooltip: "Credit & debit cards — card number, CVV, PIN, expiration, etc." },
  { value: "identity", label: "ID / Passport",icon: "🪪", tooltip: "Passports, driver's licenses, national IDs, and other identity documents." },
  { value: "crypto",   label: "Crypto",       icon: "🪙", tooltip: "Crypto wallets & exchanges — seed phrases, wallet addresses, etc." },
  { value: "file",     label: "Document",     icon: "📎", tooltip: "Physical documents — will, insurance policy, property deed, etc." },
  { value: "note",     label: "Note",         icon: "📝", tooltip: "A personal note — instructions, wishes, or anything in your own words." },
  { value: "custom",   label: "Custom",       icon: "⚙️", tooltip: "Anything that doesn't fit another category — memberships, subscriptions, etc." },
];

function AddEntryForm({
  vaultId,
  cek,
  onDone,
  onCancel,
}: {
  vaultId: string;
  cek: Uint8Array;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<EntryType>("contact");
  const [isLoading, setIsLoading] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [title, setTitle] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const fieldDefs = type === "file" ? [] : getFieldsForType(type);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (type === "file" && !selectedFile) {
      toast({ title: "Please select a file to attach", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      let payload: Record<string, string> = { type, title, ...fields };

      if (type === "file" && selectedFile) {
        const fileBytes = new Uint8Array(await selectedFile.arrayBuffer());
        const fileKey = await generateFileKey();
        const encryptedPayload = await encryptBytes(fileBytes, fileKey);
        const blob = new Blob([encryptedPayload], { type: "application/octet-stream" });
        const vaultFile = await api.uploadFile(vaultId, blob, setUploadProgress);
        const wrappedFileKey = await wrapFileKey(fileKey, cek);
        payload = {
          type,
          title,
          description: fields.description ?? "",
          original_name: selectedFile.name,
          size_bytes: String(selectedFile.size),
          storage_token: vaultFile.storage_token,
          wrapped_file_key: wrappedFileKey,
        };
      }

      const encrypted_data = await encryptObject(payload, cek);
      await api.createEntry(vaultId, { entry_type: type, title, encrypted_data });
      toast({ title: "Entry added", variant: "success" });
      onDone();
    } catch (err) {
      toast({ title: err instanceof APIError ? (err as APIError).message : "Failed to save entry", variant: "destructive" });
    } finally {
      setIsLoading(false);
      setUploadProgress(0);
    }
  };

  return (
    <Card className="mb-3">
      <CardContent className="pt-5">
        <h3 className="text-sm font-medium text-text-primary mb-4">New entry</h3>

        {/* Type selector */}
        <TooltipProvider>
          <div className="flex flex-wrap gap-2 mb-4">
            {ENTRY_TYPES.map((t) => (
              <Tooltip key={t.value} content={t.tooltip}>
                <button
                  type="button"
                  onClick={() => { setType(t.value); setFields({}); setSelectedFile(null); }}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                    type === t.value
                      ? "bg-primary text-white border-primary"
                      : "border-border text-text-secondary hover:border-primary/50 hover:text-text-primary"
                  )}
                >
                  {t.icon} {t.label}
                </button>
              </Tooltip>
            ))}
          </div>
        </TooltipProvider>

        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            label="Name"
            placeholder={
              type === "contact" ? "e.g. Dr. Sarah Johnson, John at State Farm" :
              type === "login" ? "e.g. Netflix, Gmail, Amazon" :
              type === "financial" ? "e.g. Chase Checking, Fidelity 401k" :
              type === "card" ? "e.g. Visa ending in 4242" :
              type === "identity" ? "e.g. US Passport, Driver's License" :
              type === "crypto" ? "e.g. Coinbase, Ledger wallet" :
              type === "file" ? "e.g. Life insurance policy" :
              type === "note" ? "e.g. Instructions for my executor" :
              "e.g. Gym membership, Storage unit"
            }
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
          {type === "file" ? (
            <FileUploadSection
              selectedFile={selectedFile}
              onFileSelect={setSelectedFile}
              description={fields.description ?? ""}
              onDescriptionChange={(v) => setFields((p) => ({ ...p, description: v }))}
              uploadProgress={isLoading ? uploadProgress : null}
            />
          ) : (
            fieldDefs.map((f) => (
              <div key={f.key}>
                {f.type === "textarea" ? (
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-text-secondary">{f.label}</label>
                    <textarea
                      className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 min-h-[80px] resize-y"
                      placeholder={f.placeholder}
                      value={fields[f.key] ?? ""}
                      onChange={(e) => setFields((p) => ({ ...p, [f.key]: e.target.value }))}
                    />
                  </div>
                ) : (
                  <Input
                    label={f.label}
                    type={f.type}
                    placeholder={f.placeholder}
                    value={fields[f.key] ?? ""}
                    onChange={(e) => setFields((p) => ({ ...p, [f.key]: e.target.value }))}
                  />
                )}
              </div>
            ))
          )}
          <div className="flex gap-2 justify-end pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
            <Button type="submit" size="sm" loading={isLoading}>Save entry</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ---- File upload section ----
function FileUploadSection({
  selectedFile,
  onFileSelect,
  description,
  onDescriptionChange,
  uploadProgress,
}: {
  selectedFile: File | null;
  onFileSelect: (f: File | null) => void;
  description: string;
  onDescriptionChange: (v: string) => void;
  uploadProgress: number | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onFileSelect(file);
  };

  return (
    <div className="space-y-3">
      <div
        className={cn(
          "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
          dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
        )}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => onFileSelect(e.target.files?.[0] ?? null)}
        />
        {selectedFile ? (
          <div className="flex items-center justify-center gap-2">
            <FileIcon className="h-5 w-5 text-primary" />
            <div className="text-left">
              <p className="text-sm font-medium text-text-primary">{selectedFile.name}</p>
              <p className="text-xs text-text-muted">{formatFileSize(selectedFile.size)}</p>
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-6 w-6 ml-2"
              onClick={(e) => { e.stopPropagation(); onFileSelect(null); }}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <div className="space-y-1">
            <Upload className="h-6 w-6 text-text-muted mx-auto" />
            <p className="text-sm text-text-secondary">Drop a file here or click to browse</p>
            <p className="text-xs text-text-muted">File is encrypted locally before upload</p>
          </div>
        )}
      </div>

      {uploadProgress !== null && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-text-muted">
            <span>Uploading…</span>
            <span>{uploadProgress}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-surface-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300 rounded-full"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-text-secondary">Description (optional)</label>
        <textarea
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 min-h-[60px] resize-y"
          placeholder="What is this file? Where can the original be found?"
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
        />
      </div>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---- Entry card ----
function EntryCard({
  entry,
  decrypted,
  expanded,
  onToggle,
  onDelete,
  onUpdate,
  onFavoriteToggle,
  vaultId,
  cek,
}: {
  entry: VaultEntry;
  decrypted?: object;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onUpdate: () => void;
  onFavoriteToggle: (newVal: boolean) => void;
  vaultId: string;
  cek: Uint8Array;
}) {
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const d = decrypted as Record<string, string> | undefined;
  const icon = entryTypeIcon(entry.entry_type as EntryType);
  const title = d?.title ?? entry.entry_type;

  const favMutation = useMutation({
    mutationFn: (val: boolean) => api.updateEntry(vaultId, entry.id, { is_favorite: val }),
    onMutate: (val) => onFavoriteToggle(val),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["entries", vaultId] }),
  });

  if (editing && d) {
    return (
      <EditEntryForm
        vaultId={vaultId}
        entry={entry}
        decrypted={d}
        cek={cek}
        onDone={() => { setEditing(false); onUpdate(); }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="bg-surface">
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-surface-muted transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2 min-w-0">
          <GripVertical
            className="h-4 w-4 text-text-muted/40 hover:text-text-muted flex-shrink-0 cursor-grab active:cursor-grabbing"
            onClick={(e) => e.stopPropagation()}
          />
          <span className="text-text-muted">{icon}</span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-text-primary truncate">{title}</p>
            {title.toLowerCase() !== entry.entry_type.toLowerCase() && (
              <p className="text-xs text-text-muted capitalize">{entry.entry_type}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={(e) => { e.stopPropagation(); favMutation.mutate(!entry.is_favorite); }}
            title={entry.is_favorite ? "Remove from favorites" : "Add to favorites"}
          >
            <Star className={cn("h-3.5 w-3.5", entry.is_favorite ? "fill-amber-400 text-amber-400" : "text-text-muted/50")} />
          </Button>
          <div className="relative">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }} />
                <div className="absolute right-0 top-7 z-20 w-36 rounded-lg border border-border bg-surface shadow-dialog py-1">
                  <button
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-surface-muted"
                    onClick={(e) => { e.stopPropagation(); setEditing(true); setMenuOpen(false); }}
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                  <button
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-surface-muted"
                    onClick={(e) => { e.stopPropagation(); setShowHistory(true); setMenuOpen(false); }}
                  >
                    <History className="h-3.5 w-3.5" /> History
                  </button>
                  <button
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive-50"
                    onClick={(e) => { e.stopPropagation(); onDelete(); setMenuOpen(false); }}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                </div>
              </>
            )}
          </div>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-text-muted" />
          ) : (
            <ChevronDown className="h-4 w-4 text-text-muted" />
          )}
        </div>
      </div>

      {expanded && d && (
        <div className="border-t border-border px-4 py-3 space-y-2 bg-surface-muted/50 rounded-b-lg">
          {entry.entry_type === "file" ? (
            <FileEntryView decrypted={d} cek={cek} />
          ) : (
            Object.entries(d)
              .filter(([k]) => k !== "type" && k !== "title")
              .map(([key, value]) => {
                const href = key === "url" && value
                  ? (value.startsWith("http://") || value.startsWith("https://") ? value : `https://${value}`)
                  : null;
                return (
                  <div key={key}>
                    <p className="text-xs font-medium text-text-muted capitalize">
                      {key.replace(/_/g, " ")}
                    </p>
                    {href ? (
                      <a href={href} target="_blank" rel="noopener noreferrer" className="text-sm text-primary mt-0.5 break-all hover:underline">
                        {value}
                      </a>
                    ) : (
                      <p className="text-sm text-text-primary mt-0.5 break-all">{value}</p>
                    )}
                  </div>
                );
              })
          )}
        </div>
      )}

      {showHistory && (
        <HistoryDrawer
          vaultId={vaultId}
          entry={entry}
          cek={cek}
          onClose={() => setShowHistory(false)}
          onRestored={() => { setShowHistory(false); onUpdate(); }}
        />
      )}
    </div>
  );
}

// ---- File entry view ----
function FileEntryView({
  decrypted,
  cek,
}: {
  decrypted: Record<string, string>;
  cek: Uint8Array;
}) {
  const [downloading, setDownloading] = useState(false);
  const canDownload = !!(decrypted.storage_token && decrypted.wrapped_file_key);

  const handleDownload = async () => {
    if (!canDownload) return;
    setDownloading(true);
    try {
      const encryptedBuffer = await api.downloadFile(decrypted.storage_token);
      const encryptedPayload = new TextDecoder().decode(encryptedBuffer);
      const fileKey = await unwrapFileKey(decrypted.wrapped_file_key, cek);
      const plainBytes = await decryptBytes(encryptedPayload, fileKey);
      const blob = new Blob([plainBytes.buffer as ArrayBuffer]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = decrypted.original_name ?? "file";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Download failed — could not decrypt file", variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-surface">
        <FileIcon className="h-8 w-8 text-primary flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary truncate">
            {decrypted.original_name ?? "Encrypted file"}
          </p>
          {decrypted.size_bytes && (
            <p className="text-xs text-text-muted">{formatFileSize(Number(decrypted.size_bytes))}</p>
          )}
        </div>
        <Button size="sm" variant="outline" loading={downloading} onClick={handleDownload} disabled={!canDownload} className="gap-1.5 flex-shrink-0">
          <Download className="h-3.5 w-3.5" /> Download
        </Button>
      </div>
      {decrypted.description && (
        <div>
          <p className="text-xs font-medium text-text-muted">Description</p>
          <p className="text-sm text-text-primary mt-0.5">{decrypted.description}</p>
        </div>
      )}
    </div>
  );
}

// ---- Version history drawer ----

function HistoryDrawer({
  vaultId,
  entry,
  cek,
  onClose,
  onRestored,
}: {
  vaultId: string;
  entry: VaultEntry;
  cek: Uint8Array;
  onClose: () => void;
  onRestored: () => void;
}) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [decryptedVersions, setDecryptedVersions] = useState<Record<string, Record<string, string>>>({});

  const { data: versions = [], isLoading } = useQuery<VaultEntryVersion[]>({
    queryKey: ["entry-history", entry.id],
    queryFn: () => api.getEntryHistory(vaultId, entry.id),
  });

  const decrypt = async (v: VaultEntryVersion) => {
    if (decryptedVersions[v.id]) {
      setExpanded((prev) => (prev === v.id ? null : v.id));
      return;
    }
    try {
      const data = await decryptObject<Record<string, string>>(v.encrypted_data, cek);
      setDecryptedVersions((prev) => ({ ...prev, [v.id]: data }));
      setExpanded(v.id);
    } catch {
      toast({ title: "Failed to decrypt this version.", variant: "destructive" });
    }
  };

  const restoreMutation = useMutation({
    mutationFn: async (v: VaultEntryVersion) => {
      const data = decryptedVersions[v.id];
      if (!data) throw new Error("Decrypt the version first");
      const { title, ...fields } = data;
      const newEncrypted = await encryptObject({ type: entry.entry_type, title, ...fields }, cek);
      await api.updateEntry(vaultId, entry.id, { encrypted_data: newEncrypted, title });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entries", vaultId] });
      toast({ title: "Entry restored to selected version.", variant: "success" });
      onRestored();
    },
    onError: (err) => {
      toast({ title: err instanceof APIError ? err.message : "Restore failed.", variant: "destructive" });
    },
  });

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm bg-surface h-full shadow-xl flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-text-muted" />
            <h2 className="text-sm font-semibold text-text-primary">Version history</h2>
          </div>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="p-4 space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 rounded-lg bg-surface-muted animate-pulse" />
              ))}
            </div>
          )}

          {!isLoading && versions.length === 0 && (
            <div className="flex flex-col items-center justify-center h-48 gap-2 text-center px-6">
              <History className="h-8 w-8 text-text-muted" />
              <p className="text-sm text-text-secondary">No previous versions found.</p>
              <p className="text-xs text-text-muted">Versions are saved each time you edit an entry.</p>
            </div>
          )}

          {!isLoading && versions.length > 0 && (
            <div className="divide-y divide-border">
              {versions.map((v, i) => {
                const isOpen = expanded === v.id;
                const d = decryptedVersions[v.id];
                const isCurrent = i === 0;
                return (
                  <div key={v.id}>
                    <button
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-muted text-left"
                      onClick={() => decrypt(v)}
                    >
                      <div>
                        <p className="text-sm font-medium text-text-primary">
                          {isCurrent ? "Current version" : `Version ${versions.length - i}`}
                        </p>
                        <p className="text-xs text-text-muted mt-0.5">
                          {new Date(v.created_at).toLocaleString()}
                        </p>
                      </div>
                      <ChevronDown className={cn("h-4 w-4 text-text-muted transition-transform", isOpen && "rotate-180")} />
                    </button>

                    {isOpen && d && (
                      <div className="px-4 pb-3 space-y-2 bg-surface-muted/40">
                        {Object.entries(d)
                          .filter(([k]) => k !== "type" && k !== "title")
                          .map(([key, value]) => (
                            <div key={key}>
                              <p className="text-xs font-medium text-text-muted capitalize">{key.replace(/_/g, " ")}</p>
                              <p className="text-sm text-text-primary break-all">{value}</p>
                            </div>
                          ))}
                        {!isCurrent && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-2 gap-1.5"
                            loading={restoreMutation.isPending}
                            onClick={() => restoreMutation.mutate(v)}
                          >
                            <RotateCcw className="h-3.5 w-3.5" /> Restore this version
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ---- Field definitions per entry type ----
interface FieldDef {
  key: string;
  label: string;
  type: string;
  placeholder: string;
}

function getFieldsForType(type: EntryType): FieldDef[] {
  switch (type) {
    case "contact":
      return [
        { key: "relationship", label: "Relationship / Role", type: "text", placeholder: "e.g. Family doctor, Attorney, Work manager" },
        { key: "phone", label: "Phone number", type: "text", placeholder: "e.g. (555) 123-4567" },
        { key: "email", label: "Email", type: "text", placeholder: "e.g. sarah@example.com" },
        { key: "address", label: "Address", type: "text", placeholder: "e.g. 123 Main St, City, State" },
        { key: "notes", label: "Notes", type: "textarea", placeholder: "Any additional context..." },
      ];
    case "login":
      return [
        { key: "username", label: "Username / Email", type: "text", placeholder: "user@example.com" },
        { key: "password", label: "Password", type: "password", placeholder: "••••••••" },
        { key: "url", label: "Website URL", type: "text", placeholder: "example.com or http://192.168.1.1" },
        { key: "notes", label: "Notes", type: "textarea", placeholder: "Any additional info..." },
      ];
    case "note":
      return [
        { key: "content", label: "Content", type: "textarea", placeholder: "Write your note here..." },
      ];
    case "file":
      return []; // File type uses FileUploadSection instead
    case "financial":
      return [
        { key: "institution", label: "Institution", type: "text", placeholder: "e.g. Chase Bank" },
        { key: "account_number", label: "Account number", type: "text", placeholder: "****1234" },
        { key: "account_type", label: "Account type", type: "text", placeholder: "e.g. Checking, Savings, Brokerage" },
        { key: "routing_number", label: "Routing number", type: "text", placeholder: "e.g. 021000021" },
        { key: "online_username", label: "Online username / email", type: "text", placeholder: "user@example.com" },
        { key: "online_password", label: "Online password", type: "password", placeholder: "••••••••" },
        { key: "notes", label: "Notes", type: "textarea", placeholder: "Access instructions, contact info..." },
      ];
    case "card":
      return [
        { key: "cardholder_name", label: "Cardholder name", type: "text", placeholder: "Jane Smith" },
        { key: "card_number", label: "Card number", type: "text", placeholder: "1234 5678 9012 3456" },
        { key: "expiration", label: "Expiration date", type: "text", placeholder: "MM/YY" },
        { key: "cvv", label: "CVV", type: "text", placeholder: "123" },
        { key: "pin", label: "PIN", type: "password", placeholder: "••••" },
        { key: "bank", label: "Issuing bank", type: "text", placeholder: "e.g. Chase, Amex, Capital One" },
        { key: "card_type", label: "Card type", type: "text", placeholder: "e.g. Visa, Mastercard, Amex" },
        { key: "notes", label: "Notes", type: "textarea", placeholder: "Any additional info..." },
      ];
    case "identity":
      return [
        { key: "doc_type",        label: "Document type",    type: "text", placeholder: "e.g. Passport, Driver's License, National ID" },
        { key: "doc_number",      label: "Document number",  type: "text", placeholder: "e.g. A12345678" },
        { key: "issuing_country", label: "Issuing country / state", type: "text", placeholder: "e.g. United States, California" },
        { key: "issue_date",      label: "Issue date",       type: "text", placeholder: "e.g. 2020-03-15" },
        { key: "expiry_date",     label: "Expiry date",      type: "text", placeholder: "e.g. 2030-03-14" },
        { key: "notes",           label: "Notes",            type: "textarea", placeholder: "Storage location, renewal reminders, etc." },
      ];
    case "crypto":
      return [
        { key: "wallet_name", label: "Wallet / Exchange", type: "text", placeholder: "e.g. Coinbase, hardware wallet" },
        { key: "seed_phrase", label: "Seed phrase", type: "textarea", placeholder: "12 or 24 word seed phrase..." },
        { key: "notes", label: "Notes", type: "textarea", placeholder: "Access instructions..." },
      ];
    default:
      return [
        { key: "category", label: "Category", type: "text", placeholder: "e.g. Insurance, Membership, Legal, Medical..." },
        { key: "details", label: "Details", type: "textarea", placeholder: "Enter any information you want to pass on..." },
      ];
  }
}

// ---- Edit entry form ----
function EditEntryForm({
  vaultId,
  entry,
  decrypted,
  cek,
  onDone,
  onCancel,
}: {
  vaultId: string;
  entry: VaultEntry;
  decrypted: Record<string, string>;
  cek: Uint8Array;
  onDone: () => void;
  onCancel: () => void;
}) {
  const isFileEntry = entry.entry_type === "file";
  const fieldDefs = isFileEntry ? [] : getFieldsForType(entry.entry_type as EntryType);
  const [title, setTitle] = useState(decrypted.title ?? "");
  const [fields, setFields] = useState<Record<string, string>>(() => {
    if (isFileEntry) return { description: decrypted.description ?? "" };
    const f: Record<string, string> = {};
    for (const fd of fieldDefs) f[fd.key] = decrypted[fd.key] ?? "";
    return f;
  });
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setIsLoading(true);
    try {
      // For file entries preserve all existing file metadata, only update title + description
      const payload = isFileEntry
        ? { ...decrypted, title, description: fields.description ?? "" }
        : { type: entry.entry_type, title, ...fields };
      const encrypted_data = await encryptObject(payload, cek);
      await api.updateEntry(vaultId, entry.id, { title, encrypted_data });
      toast({ title: "Entry updated", variant: "success" });
      onDone();
    } catch (err) {
      toast({ title: err instanceof APIError ? err.message : "Failed to update entry", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="mb-3">
      <CardContent className="pt-5">
        <h3 className="text-sm font-medium text-text-primary mb-4">Edit entry</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
          {isFileEntry ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 p-3 rounded-lg border border-border bg-surface-muted/50">
                <FileIcon className="h-5 w-5 text-text-muted flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm text-text-primary truncate">{decrypted.original_name ?? "Encrypted file"}</p>
                  {decrypted.size_bytes && (
                    <p className="text-xs text-text-muted">{formatFileSize(Number(decrypted.size_bytes))}</p>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-text-secondary">Description (optional)</label>
                <textarea
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 min-h-[60px] resize-y"
                  placeholder="What is this file?"
                  value={fields.description ?? ""}
                  onChange={(e) => setFields((p) => ({ ...p, description: e.target.value }))}
                />
              </div>
            </div>
          ) : (
            fieldDefs.map((f) => (
              <div key={f.key}>
                {f.type === "textarea" ? (
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-text-secondary">{f.label}</label>
                    <textarea
                      className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 min-h-[80px] resize-y"
                      placeholder={f.placeholder}
                      value={fields[f.key] ?? ""}
                      onChange={(e) => setFields((p) => ({ ...p, [f.key]: e.target.value }))}
                    />
                  </div>
                ) : (
                  <Input
                    label={f.label}
                    type={f.type}
                    placeholder={f.placeholder}
                    value={fields[f.key] ?? ""}
                    onChange={(e) => setFields((p) => ({ ...p, [f.key]: e.target.value }))}
                  />
                )}
              </div>
            ))
          )}
          <div className="flex gap-2 justify-end pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
            <Button type="submit" size="sm" loading={isLoading}>Save changes</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ---- Delivery message form ----
function DeliveryMessageForm({
  vaultId,
  cek,
  currentMessage,
  onDone,
  onCancel,
}: {
  vaultId: string;
  cek: Uint8Array;
  currentMessage: string | null;
  onDone: (msg: string) => void;
  onCancel: () => void;
}) {
  const [message, setMessage] = useState(currentMessage ?? "");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const { encrypt } = await import("@/lib/crypto");
      const delivery_message_enc = message.trim()
        ? await encrypt(message.trim(), cek)
        : "";
      await api.updateVault(vaultId, { delivery_message_enc: delivery_message_enc || null } as Parameters<typeof api.updateVault>[1]);
      toast({ title: "Message saved", variant: "success" });
      onDone(message.trim());
    } catch (err) {
      toast({ title: err instanceof APIError ? err.message : "Failed to save message", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="mb-3">
      <CardContent className="pt-5">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-text-secondary">Personal message</label>
            <RichTextEditor
              content={message}
              onChange={setMessage}
            />
          </div>
          <p className="text-xs text-text-muted">
            This message is encrypted and can only be read by your beneficiaries after they unlock the vault.
          </p>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
            <Button type="submit" size="sm" loading={isLoading}>Save message</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ---- Assign beneficiary form ----
function AssignBeneficiaryForm({
  vaultId,
  cek,
  onDone,
  onCancel,
}: {
  vaultId: string;
  cek: Uint8Array;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { data: beneficiaries } = useQuery({
    queryKey: ["beneficiaries"],
    queryFn: () => api.listBeneficiaries(),
  });

  const { data: assigned } = useQuery({
    queryKey: ["vault-beneficiaries", vaultId],
    queryFn: () => api.getVaultBeneficiaries(vaultId),
  });

  const assignedIds = new Set(assigned?.map((a) => a.beneficiary_id) ?? []);
  const available = beneficiaries?.filter((b) => !assignedIds.has(b.id)) ?? [];

  const [selectedId, setSelectedId] = useState("");
  const [accessKey, setAccessKey] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId || !accessKey.trim()) return;
    setIsLoading(true);
    try {
      const envelope = await wrapCEKForBeneficiary(cek, accessKey.trim());
      await api.assignBeneficiaryToVault(vaultId, {
        beneficiary_id: selectedId,
        beneficiary_cek_envelope: envelope,
      });
      toast({ title: "Access granted", variant: "success" });
      onDone();
    } catch (err) {
      toast({ title: err instanceof APIError ? err.message : "Failed to grant access", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="mb-3">
      <CardContent className="pt-5">
        <h3 className="text-sm font-medium text-text-primary mb-1">Grant vault access</h3>
        <p className="text-xs text-text-muted mb-4">
          Choose a beneficiary and set an access key. Share the access key with them directly — it&apos;s never stored on our servers.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-text-secondary">Beneficiary</label>
            <select
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              required
            >
              <option value="">Select a beneficiary...</option>
              {available.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.email})
                </option>
              ))}
            </select>
            {available.length === 0 && beneficiaries && (
              <p className="text-xs text-text-muted mt-1">
                {beneficiaries.length === 0
                  ? "No beneficiaries yet. Add one from the Beneficiaries page."
                  : "All beneficiaries already have access to this vault."}
              </p>
            )}
          </div>
          <Input
            label="Access key"
            type="text"
            placeholder="e.g. a word or phrase you share with them privately"
            value={accessKey}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAccessKey(e.target.value)}
            required
          />
          <p className="text-xs text-text-muted -mt-1">
            This key is used to encrypt their copy of the vault key. Remember to share it with them out-of-band (in person, Signal, etc.).
          </p>
          <div className="flex gap-2 justify-end pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
            <Button type="submit" size="sm" loading={isLoading} disabled={!selectedId || !accessKey.trim()}>
              Grant access
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ---- Vault beneficiary row ----
type VaultBeneficiaryInfo = {
  id: string;
  vault_id: string;
  beneficiary_id: string;
  additional_delay_days: number;
  created_at: string;
  beneficiary_name: string;
  beneficiary_email: string;
  email_confirmed: boolean;
};

function VaultBeneficiaryRow({
  vaultBeneficiary: vb,
  vaultId,
  cek,
  onRemoved,
}: {
  vaultBeneficiary: VaultBeneficiaryInfo;
  vaultId: string;
  cek: Uint8Array | null;
  onRemoved: () => void;
}) {
  const [rekey, setRekey] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [rekeyLoading, setRekeyLoading] = useState(false);

  const removeMutation = useMutation({
    mutationFn: () => api.removeVaultBeneficiary(vaultId, vb.beneficiary_id),
    onSuccess: () => {
      toast({ title: "Access revoked" });
      onRemoved();
    },
    onError: (err) => {
      toast({ title: err instanceof APIError ? err.message : "Failed to revoke", variant: "destructive" });
    },
  });

  const handleRekey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cek || !newKey.trim()) return;
    setRekeyLoading(true);
    try {
      const envelope = await wrapCEKForBeneficiary(cek, newKey.trim());
      await api.assignBeneficiaryToVault(vaultId, {
        beneficiary_id: vb.beneficiary_id,
        beneficiary_cek_envelope: envelope,
      });
      toast({ title: "Access key updated", variant: "success" });
      setRekey(false);
      setNewKey("");
    } catch (err) {
      toast({ title: err instanceof APIError ? err.message : "Failed to update key", variant: "destructive" });
    } finally {
      setRekeyLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-surface overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-8 w-8 rounded-full bg-primary-50 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-semibold text-primary">
              {vb.beneficiary_name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-text-primary">{vb.beneficiary_name}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Mail className="h-3 w-3 text-text-muted flex-shrink-0" />
              <span className="text-xs text-text-muted truncate">{vb.beneficiary_email}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
          <span className={cn(
            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
            vb.email_confirmed ? "bg-success-50 text-success-700" : "bg-surface-muted text-text-muted"
          )}>
            {vb.email_confirmed ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
            {vb.email_confirmed ? "Confirmed" : "Invited"}
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-text-muted hover:text-text-primary"
            title="Change access key"
            onClick={() => setRekey((v) => !v)}
          >
            <Key className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-text-muted hover:text-destructive hover:bg-destructive-50"
            title="Revoke access"
            loading={removeMutation.isPending}
            onClick={() => {
              if (confirm(`Revoke ${vb.beneficiary_name}'s access to this vault?`)) {
                removeMutation.mutate();
              }
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      {rekey && cek && (
        <form onSubmit={handleRekey} className="border-t border-border px-4 py-3 bg-surface-muted/50 flex gap-2 items-end">
          <div className="flex-1">
            <Input
              label="New access key"
              type="text"
              placeholder="New key to share with beneficiary"
              value={newKey}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewKey(e.target.value)}
            />
          </div>
          <Button type="submit" size="sm" loading={rekeyLoading} disabled={!newKey.trim()} className="mb-0.5">
            Update
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => { setRekey(false); setNewKey(""); }} className="mb-0.5">
            Cancel
          </Button>
        </form>
      )}
    </div>
  );
}

// ---- Vault preview modal ----
function VaultPreviewModal({
  vault,
  entries,
  decryptedEntries,
  deliveryMessage,
  cek,
  onClose,
}: {
  vault: Vault;
  entries: VaultEntry[];
  decryptedEntries: Record<string, object>;
  deliveryMessage: string | null;
  cek: Uint8Array;
  onClose: () => void;
}) {
  const { data: branding } = useQuery({ queryKey: ["branding"], queryFn: () => api.getBranding(), staleTime: Infinity });
  const appName = branding?.app_name || "P.S. Vault";
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const PREVIEW_GROUPS = [
    { type: "contact",   label: "Contacts" },
    { type: "login",     label: "Logins" },
    { type: "financial", label: "Financial Accounts" },
    { type: "card",      label: "Cards" },
    { type: "identity",  label: "Identity Documents" },
    { type: "crypto",    label: "Crypto" },
    { type: "file",      label: "Documents" },
    { type: "note",      label: "Notes" },
    { type: "custom",    label: "Other" },
  ];

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(PREVIEW_GROUPS.map((g) => g.type))
  );

  const grouped = PREVIEW_GROUPS
    .map((g) => ({ ...g, items: entries.filter((e) => e.entry_type === g.type) }))
    .filter((g) => g.items.length > 0);

  const knownTypes = new Set(PREVIEW_GROUPS.map((g) => g.type));
  const ungrouped = entries.filter((e) => !knownTypes.has(e.entry_type));
  if (ungrouped.length > 0) grouped.push({ type: "_other", label: "Other", items: ungrouped });

  const toggleGroup = (type: string) =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      next.has(type) ? next.delete(type) : next.add(type);
      return next;
    });

  const modal = (
    <div className="fixed inset-0 z-[9999] flex flex-col overflow-y-auto" style={{ background: "linear-gradient(160deg, #fff1f2 0%, #fdf8f6 30%, #F9F8F6 60%)" }}>
      {/* Matches portal header exactly */}
      <header className="flex items-center gap-2.5 px-6 py-4 bg-transparent sticky top-0 z-10">
        <Shield className="h-5 w-5 text-primary" aria-hidden />
        <span className="text-base font-semibold text-text-primary">{appName}</span>
        <span className="text-text-muted mx-1">·</span>
        <span className="text-sm text-text-muted">Secure delivery</span>
        <div className="ml-auto flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-medium border border-amber-200">
            <Eye className="h-3 w-3" /> Owner preview
          </span>
          <Button size="sm" variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Matches portal main layout exactly */}
      <main className="flex-1 flex flex-col items-center p-4">
        <div className="w-full max-w-2xl space-y-5 py-8">
          {/* Vault header — matches VaultView in portal */}
          <div className="text-center pt-2">
            <div className="h-16 w-16 rounded-full bg-rose-50 flex items-center justify-center mx-auto mb-4" style={{ boxShadow: "0 0 0 6px #fff1f2" }}>
              <Heart className="h-7 w-7 text-rose-400" />
            </div>
            <h1 className="text-2xl font-semibold text-text-primary">{vault.name}</h1>
            {vault.description && (
              <p className="text-sm text-text-secondary mt-2 max-w-sm mx-auto">{vault.description}</p>
            )}
          </div>

          {/* Delivery message — matches portal style */}
          {deliveryMessage && (
            <div className="rounded-xl border border-amber-200/80 bg-amber-50/60 px-5 py-5">
              <p className="text-xs font-semibold text-amber-700/80 mb-3 uppercase tracking-wider">A message left for you</p>
              <div className="text-sm text-text-primary leading-relaxed prose-sm" dangerouslySetInnerHTML={{ __html: deliveryMessage }} />
            </div>
          )}

          {/* Entries — grouped, matches portal exactly */}
          {entries.length === 0 ? (
            <div className="rounded-xl bg-surface/80 py-10 text-center text-sm text-text-muted" style={{ boxShadow: "0 1px 6px rgba(0,0,0,0.05)" }}>
              This vault doesn&apos;t contain any entries yet.
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-text-muted font-medium px-1 mb-1">
                {entries.length} item{entries.length === 1 ? "" : "s"} · {grouped.length} group{grouped.length === 1 ? "" : "s"}
              </p>
              {grouped.map((group) => {
                const isCollapsed = collapsedGroups.has(group.type);
                return (
                  <div key={group.type} className="rounded-xl overflow-hidden" style={{ boxShadow: "0 1px 6px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)" }}>
                    <button
                      className="w-full flex items-center justify-between px-4 py-3 bg-surface hover:bg-surface-muted/50 transition-colors"
                      onClick={() => toggleGroup(group.type)}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-text-muted text-base">
                          {entryTypeIcon(group.type as EntryType)}
                        </span>
                        <span className="text-sm font-semibold text-text-primary">{group.label}</span>
                        <span className="text-xs text-text-muted bg-surface-muted px-2 py-0.5 rounded-full font-medium">
                          {group.items.length}
                        </span>
                      </div>
                      {isCollapsed
                        ? <ChevronDown className="h-4 w-4 text-text-muted flex-shrink-0" />
                        : <ChevronUp className="h-4 w-4 text-text-muted flex-shrink-0" />}
                    </button>
                    {!isCollapsed && (
                      <div className="border-t border-border/40">
                        {group.items.map((entry, idx) => {
                          const d = decryptedEntries[entry.id] as Record<string, string> | undefined;
                          const title = d?.title ?? entry.entry_type;
                          const expanded = expandedEntry === entry.id;
                          const isLast = idx === group.items.length - 1;
                          return (
                            <div key={entry.id} className={cn("bg-surface", !isLast && "border-b border-border/30")}>
                              <div
                                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-surface-muted/40 transition-colors"
                                onClick={() => setExpandedEntry((p) => (p === entry.id ? null : entry.id))}
                              >
                                <p className="text-sm font-medium text-text-primary truncate">{title}</p>
                                {expanded
                                  ? <ChevronUp className="h-4 w-4 text-text-muted flex-shrink-0 ml-2" />
                                  : <ChevronDown className="h-4 w-4 text-text-muted flex-shrink-0 ml-2" />}
                              </div>
                              {expanded && d && (
                                <div className="border-t border-border/40 px-4 py-4 space-y-4 bg-[#faf9f7]">
                                  {d._error ? (
                                    <p className="text-sm text-destructive">{d._error}</p>
                                  ) : entry.entry_type === "file" ? (
                                    <FileEntryView decrypted={d} cek={cek} />
                                  ) : (
                                    Object.entries(d)
                                      .filter(([k]) => k !== "type" && k !== "title")
                                      .map(([key, value]) => {
                                        const href = key === "url" && value
                                          ? (value.startsWith("http://") || value.startsWith("https://") ? value : `https://${value}`)
                                          : null;
                                        return (
                                          <div key={key}>
                                            <p className="text-xs font-medium text-text-muted capitalize">{key.replace(/_/g, " ")}</p>
                                            {href ? (
                                              <a href={href} target="_blank" rel="noopener noreferrer" className="text-sm text-primary mt-0.5 break-all hover:underline">{value}</a>
                                            ) : (
                                              <p className="text-sm text-text-primary mt-0.5 break-all font-mono select-all">{value}</p>
                                            )}
                                          </div>
                                        );
                                      })
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Footer note — matches portal */}
          <div className="py-3 text-center">
            <p className="text-xs text-text-muted">
              Save this information somewhere safe. This link stays active for 90 days.
            </p>
          </div>
        </div>
      </main>

      <footer className="py-4 text-center text-xs text-text-muted border-t border-border">
        {appName} · Your information is end-to-end encrypted and decrypted only in your browser.
      </footer>
    </div>
  );

  if (!mounted) return null;
  return createPortal(modal, document.body);
}

function VaultDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded skeleton" />
        <div className="h-7 w-48 rounded skeleton" />
      </div>
      <div className="space-y-2">
        {[1, 2, 3].map((i) => <div key={i} className="h-14 rounded-lg skeleton" />)}
      </div>
    </div>
  );
}
