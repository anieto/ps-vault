"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  ShieldEllipsis as Shield,
  Heart,
  Lock,
  Unlock,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  FileIcon,
  Download,
} from "lucide-react";
import { APIError } from "@/lib/api";

// Portal calls use plain fetch — no auth headers, no shared token state
const PORTAL_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api/v1";

async function portalFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${PORTAL_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    credentials: "include",
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json();
  if (!res.ok) {
    const err = body?.error;
    throw new APIError(err?.code ?? "unknown", err?.message ?? "An unexpected error occurred", res.status);
  }
  return body.data as T;
}
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, entryTypeIcon } from "@/lib/utils";
import { unwrapCEKForBeneficiary, decryptObject, decrypt, unwrapFileKey, decryptBytes } from "@/lib/crypto";
import { toast } from "@/components/ui/toaster";

type PortalState =
  | "verifying"
  | "unlock"
  | "loading_vaults"
  | "vaults"
  | "error";

export default function PortalPage() {
  const params = useParams<{ token: string }>();
  const { data: branding } = useQuery({
    queryKey: ["branding"],
    queryFn: () => api.getBranding(),
    staleTime: Infinity,
  });
  const appName = branding?.app_name || "P.S. Vault";
  const [state, setState] = useState<PortalState>("verifying");
  const [errorMsg, setErrorMsg] = useState("");
  const [vaultData, setVaultData] = useState<{
    vault: { id: string; name: string; description?: string; cek_envelope: string; delivery_message_enc?: string };
    beneficiary_cek_envelope: string;
    expires_at: string;
    entries: Array<{ id: string; entry_type: string; encrypted_data: string }>;
  } | null>(null);
  const [decryptedEntries, setDecryptedEntries] = useState<Record<string, object>>({});
  const [deliveryMessage, setDeliveryMessage] = useState<string | null>(null);
  const [cek, setCek] = useState<Uint8Array | null>(null);
  const [sharedSecret, setSharedSecret] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const [secretQuestion, setSecretQuestion] = useState<string | null>(null);

  const verifyMutation = useMutation({
    mutationFn: () => portalFetch<{ verified: boolean; access_token: string; secret_question?: string }>("/portal/verify", {
      method: "POST",
      body: JSON.stringify({ token: params.token }),
    }),
    onSuccess: (data) => {
      if (data.secret_question) setSecretQuestion(data.secret_question);
      setState("unlock");
    },
    onError: (err) => {
      setErrorMsg(err instanceof APIError ? err.message : "This link is invalid or has expired.");
      setState("error");
    },
  });

  useEffect(() => {
    verifyMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUnlock = async () => {
    if (!sharedSecret.trim()) return;
    setUnlocking(true);
    try {
      const vault = await portalFetch<{
        vault: { id: string; name: string; description?: string; cek_envelope: string; delivery_message_enc?: string };
        beneficiary_cek_envelope: string;
        expires_at: string;
      }>(`/portal/vault?token=${encodeURIComponent(params.token)}`);
      const entries = await portalFetch<Array<{
        id: string;
        entry_type: string;
        encrypted_data: string;
      }>>(`/portal/entries?token=${encodeURIComponent(params.token)}`);

      // Unwrap CEK using the shared secret (derives BAK internally via Argon2id)
      const cek = await unwrapCEKForBeneficiary(vault.beneficiary_cek_envelope, sharedSecret);
      setCek(cek);

      // Decrypt delivery message if present
      if (vault.vault.delivery_message_enc) {
        try {
          const msg = await decrypt(vault.vault.delivery_message_enc, cek);
          setDeliveryMessage(msg);
        } catch {
          setDeliveryMessage(null);
        }
      }

      // Decrypt all entries
      const decrypted: Record<string, object> = {};
      for (const entry of entries) {
        try {
          decrypted[entry.id] = await decryptObject(entry.encrypted_data, cek);
        } catch {
          decrypted[entry.id] = { _error: "Could not decrypt this entry" };
        }
      }

      setVaultData({ ...vault, entries: entries });
      setDecryptedEntries(decrypted);
      setState("vaults");
    } catch (err) {
      if (err instanceof Error && err.message.includes("decrypt")) {
        setErrorMsg("The access key is incorrect. Please check it and try again.");
      } else {
        setErrorMsg(err instanceof APIError ? err.message : "Failed to load vault.");
      }
    } finally {
      setUnlocking(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col gradient-portal">
      {/* Header — borderless, blends with gradient */}
      <header className="flex items-center gap-2.5 px-6 py-4 bg-transparent">
        {branding?.app_name ? (
          <Shield className="h-5 w-5 text-primary" aria-hidden />
        ) : (
          <img src="/logo.png" alt={appName} className="h-7 w-7 rounded-md ring-1 ring-accent-600/60" />
        )}
        <span className="text-base font-semibold text-text-primary">{appName}</span>
        <span className="text-text-muted mx-1">·</span>
        <span className="text-sm text-text-muted">Secure delivery</span>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-4">
        {state === "verifying" && (
          <div className="text-center text-text-muted text-sm">Verifying your link…</div>
        )}

        {state === "error" && <ErrorState message={errorMsg} />}

        {state === "unlock" && (
          <UnlockForm
            sharedSecret={sharedSecret}
            onSecretChange={setSharedSecret}
            onUnlock={handleUnlock}
            loading={unlocking}
            error={errorMsg}
            secretQuestion={secretQuestion}
          />
        )}

        {state === "vaults" && vaultData && cek && (
          <VaultView
            vault={vaultData.vault}
            entries={vaultData.entries}
            decryptedEntries={decryptedEntries}
            deliveryMessage={deliveryMessage}
            expiresAt={vaultData.expires_at}
            expandedEntry={expandedEntry}
            cek={cek}
            accessToken={params.token}
            onToggleEntry={(id) =>
              setExpandedEntry((prev) => (prev === id ? null : id))
            }
          />
        )}
      </main>

      <footer className="py-5 text-center text-xs text-text-muted">
        {appName} · Your information is end-to-end encrypted and decrypted only in your browser.
      </footer>
    </div>
  );
}

function UnlockForm({
  sharedSecret,
  onSecretChange,
  onUnlock,
  loading,
  error,
  secretQuestion,
}: {
  sharedSecret: string;
  onSecretChange: (v: string) => void;
  onUnlock: () => void;
  loading: boolean;
  error?: string;
  secretQuestion?: string | null;
}) {
  return (
    <div className="w-full max-w-md space-y-6">
      <div className="text-center">
        <div
          className="h-20 w-20 rounded-full bg-rose-50 flex items-center justify-center mx-auto mb-5"
          style={{ boxShadow: "0 0 0 8px #fff1f2, 0 0 0 14px #ffe4e6" }}
        >
          <Heart className="h-9 w-9 text-rose-400" />
        </div>
        <h1 className="text-2xl font-semibold text-text-primary">Someone left something for you</h1>
        <p className="text-sm text-text-secondary mt-2.5 max-w-xs mx-auto leading-relaxed">
          You&apos;ve been named as a beneficiary. Enter the access key you were given to unlock what was left for you.
        </p>
      </div>

      <div className="bg-surface rounded-2xl p-6 space-y-4" style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.07), 0 1px 4px rgba(0,0,0,0.04)" }}>
        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-50/70 border border-rose-100">
          <Lock className="h-4 w-4 text-rose-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-rose-700/80">
            End-to-end encrypted. Only someone with the access key can read the contents — not even our servers.
          </p>
        </div>

        {secretQuestion && (
          <div className="px-1">
            <p className="text-xs text-text-muted mb-1">Hint from the vault owner</p>
            <p className="text-sm text-text-primary font-medium">{secretQuestion}</p>
          </div>
        )}

        <PasswordInput
          label="Access key"
          placeholder="Enter the key you were given"
          value={sharedSecret}
          onChange={(e) => onSecretChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onUnlock()}
        />

        {error && (
          <div className="flex items-center gap-2 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
            {error}
          </div>
        )}

        <Button
          className="w-full gap-2"
          onClick={onUnlock}
          loading={loading}
          disabled={!sharedSecret.trim()}
        >
          <Unlock className="h-4 w-4" />
          Unlock vault
        </Button>
      </div>

      <p className="text-xs text-text-muted text-center">
        If you don&apos;t have an access key, the person who set up this vault should have shared it with you privately.
      </p>
    </div>
  );
}

const ENTRY_GROUPS = [
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

function VaultView({
  vault,
  entries,
  decryptedEntries,
  deliveryMessage,
  expiresAt,
  expandedEntry,
  cek,
  accessToken,
  onToggleEntry,
}: {
  vault: { id: string; name: string; description?: string };
  entries: Array<{ id: string; entry_type: string; encrypted_data: string }>;
  decryptedEntries: Record<string, object>;
  deliveryMessage: string | null;
  expiresAt: string;
  expandedEntry: string | null;
  cek: Uint8Array;
  accessToken: string;
  onToggleEntry: (id: string) => void;
}) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(ENTRY_GROUPS.map((g) => g.type))
  );
  const [printing, setPrinting] = useState(false);

  const grouped = ENTRY_GROUPS
    .map((g) => ({ ...g, items: entries.filter((e) => e.entry_type === g.type) }))
    .filter((g) => g.items.length > 0);

  // Catch any entry types not in ENTRY_GROUPS
  const knownTypes = new Set(ENTRY_GROUPS.map((g) => g.type));
  const ungrouped = entries.filter((e) => !knownTypes.has(e.entry_type));
  if (ungrouped.length > 0) grouped.push({ type: "_other", label: "Other", items: ungrouped });

  const toggleGroup = (type: string) =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      next.has(type) ? next.delete(type) : next.add(type);
      return next;
    });

  const handlePrint = () => {
    setPrinting(true);
    setTimeout(() => {
      window.print();
      setPrinting(false);
    }, 150);
  };

  const handleDownloadJSON = () => {
    const exportedEntries = entries
      .map((entry) => {
        const d = decryptedEntries[entry.id] as Record<string, string> | undefined;
        if (!d || d._error) return null;
        return { type: entry.entry_type, ...d };
      })
      .filter(Boolean);

    const payload = {
      vault: vault.name,
      description: vault.description ?? null,
      exported_at: new Date().toISOString().slice(0, 10),
      expires_at: expiresAt,
      entries: exportedEntries,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${vault.name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}-vault.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="w-full max-w-2xl space-y-5">
      <div className="text-center pt-2">
        <div className="h-16 w-16 rounded-full bg-rose-50 flex items-center justify-center mx-auto mb-4" style={{ boxShadow: "0 0 0 6px #fff1f2" }}>
          <Heart className="h-7 w-7 text-rose-400" />
        </div>
        <h1 className="text-2xl font-semibold text-text-primary">{vault.name}</h1>
        {vault.description && (
          <p className="text-sm text-text-secondary mt-2 max-w-sm mx-auto">{vault.description}</p>
        )}
      </div>

      {deliveryMessage && (
        <div className="rounded-xl border border-amber-200/80 dark:border-amber-700/60 bg-amber-50/60 dark:bg-amber-950/30 px-5 py-5">
          <p className="text-xs font-semibold text-amber-700/80 dark:text-amber-400/80 mb-3 uppercase tracking-wider">A message left for you</p>
          <div className="text-sm text-text-primary leading-relaxed prose-sm" dangerouslySetInnerHTML={{ __html: deliveryMessage }} />
        </div>
      )}

      {entries.length === 0 ? (
        <div className="rounded-xl bg-surface/80 py-10 text-center text-sm text-text-muted" style={{ boxShadow: "0 1px 6px rgba(0,0,0,0.05)" }}>
          This vault doesn&apos;t contain any entries.
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
                {/* Group header */}
                <button
                  className="w-full flex items-center justify-between px-4 py-3 bg-surface hover:bg-surface-muted/50 transition-colors"
                  onClick={() => toggleGroup(group.type)}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-text-muted text-base">
                      {entryTypeIcon(group.type as Parameters<typeof entryTypeIcon>[0])}
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

                {(printing || !isCollapsed) && (
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
                          onClick={() => onToggleEntry(entry.id)}
                        >
                          <p className="text-sm font-medium text-text-primary truncate">{title}</p>
                          {!printing && (expanded
                            ? <ChevronUp className="h-4 w-4 text-text-muted flex-shrink-0 ml-2" />
                            : <ChevronDown className="h-4 w-4 text-text-muted flex-shrink-0 ml-2" />)}
                        </div>
                        {(printing || expanded) && d && (
                        <div className="border-t border-border/40 px-4 py-4 space-y-4 bg-surface-muted">
                          {d ? (
                            d._error ? (
                              <p className="text-sm text-destructive">{d._error}</p>
                            ) : entry.entry_type === "file" ? (
                              <PortalFileEntryView decrypted={d} cek={cek} accessToken={accessToken} />
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
                                        <p className="text-sm text-text-primary mt-0.5 break-all font-mono select-all">
                                          {value}
                                        </p>
                                      )}
                                    </div>
                                  );
                                })
                            )
                          ) : null}
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

      <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-5 py-4 space-y-3 print:hidden">
        <div className="flex items-start gap-3">
          <span className="text-xl leading-none mt-0.5">⚠️</span>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Save this information now</p>
            <p className="text-sm text-amber-800 dark:text-amber-300 leading-relaxed">
              This link expires on <strong>{new Date(expiresAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</strong>. After that, you will no longer be able to access this vault. Save a copy before then.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleDownloadJSON}
            className="rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-amber-900/30 hover:bg-amber-50 dark:hover:bg-amber-900/50 text-amber-900 dark:text-amber-200 text-sm font-medium py-2.5 transition-colors flex items-center justify-center gap-2"
          >
            <Download className="h-4 w-4" />
            Save as JSON
          </button>
          <button
            onClick={handlePrint}
            className="rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-amber-900/30 hover:bg-amber-50 dark:hover:bg-amber-900/50 text-amber-900 dark:text-amber-200 text-sm font-medium py-2.5 transition-colors"
          >
            Print / Save as PDF
          </button>
        </div>
        <p className="text-xs text-amber-700/70 dark:text-amber-400/70 text-center">
          JSON saves all text fields. Use Print to save files and formatted content as a PDF.
        </p>
      </div>
    </div>
  );
}

function PortalFileEntryView({
  decrypted,
  cek,
  accessToken,
}: {
  decrypted: Record<string, string>;
  cek: Uint8Array;
  accessToken: string;
}) {
  const [downloading, setDownloading] = useState(false);
  const PORTAL_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api/v1";

  const canDownload = !!(decrypted.storage_token && decrypted.wrapped_file_key);

  const handleDownload = async () => {
    if (!canDownload) return;
    setDownloading(true);
    try {
      const url = `${PORTAL_BASE}/portal/files/${encodeURIComponent(decrypted.storage_token)}?token=${encodeURIComponent(accessToken)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Download failed");
      const encryptedBuffer = await res.arrayBuffer();
      const encryptedPayload = new TextDecoder().decode(encryptedBuffer);
      const fileKey = await unwrapFileKey(decrypted.wrapped_file_key, cek);
      const plainBytes = await decryptBytes(encryptedPayload, fileKey);
      const blob = new Blob([plainBytes.buffer as ArrayBuffer]);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = decrypted.original_name ?? "file";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      toast({ title: "Download failed — could not decrypt file", variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  const sizeBytes = Number(decrypted.size_bytes);
  const sizeLabel = sizeBytes < 1024 ? `${sizeBytes} B`
    : sizeBytes < 1024 * 1024 ? `${(sizeBytes / 1024).toFixed(1)} KB`
    : `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-surface">
        <FileIcon className="h-8 w-8 text-primary flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary truncate">
            {decrypted.original_name ?? "Encrypted file"}
          </p>
          {decrypted.size_bytes && (
            <p className="text-xs text-text-muted">{sizeLabel}</p>
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

function ErrorState({ message }: { message: string }) {
  return (
    <div className="w-full max-w-md text-center space-y-4">
      <div className="h-14 w-14 rounded-full bg-destructive-50 flex items-center justify-center mx-auto">
        <AlertCircle className="h-7 w-7 text-destructive" />
      </div>
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Link unavailable</h1>
        <p className="text-sm text-text-secondary mt-2">{message}</p>
      </div>
      <p className="text-xs text-text-muted">
        If you believe this is an error, please reach out to the person who shared this link with you.
      </p>
    </div>
  );
}
