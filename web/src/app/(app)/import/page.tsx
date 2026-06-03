"use client";

import { useState, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Upload, FileText, CheckCircle2, AlertCircle, ChevronRight, X } from "lucide-react";
import { api, APIError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/components/ui/toaster";
import { getMEK, unwrapCEK, encryptObject } from "@/lib/crypto";
import { cn, entryTypeIcon } from "@/lib/utils";
import type { Vault } from "@/types";
import {
  type ParsedEntry,
  type ImportFormat,
  type CSVMappingState,
  detectFormat,
  parseBitwarden,
  parseLastPass,
  parseKeePass,
  parse1Password,
  parseGenericCSVHeaders,
  applyGenericCSVMapping,
} from "@/lib/import";

type Step = "select" | "preview" | "mapping" | "importing" | "done";

const FORMAT_LABELS: Record<ImportFormat, string> = {
  bitwarden: "Bitwarden",
  lastpass: "LastPass",
  keepass: "KeePass",
  "1password": "1Password",
  csv: "Generic CSV",
};

const ENTRY_TYPES = ["login", "note", "financial", "card", "identity", "crypto", "contact", "custom"] as const;

const CSV_TARGET_FIELDS: { field: string; label: string }[] = [
  { field: "title", label: "Title" },
  { field: "username", label: "Username" },
  { field: "password", label: "Password" },
  { field: "url", label: "URL" },
  { field: "notes", label: "Notes" },
  { field: "content", label: "Content (note)" },
];

export default function ImportPage() {
  const [step, setStep] = useState<Step>("select");
  const [vaultId, setVaultId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<ImportFormat | null>(null);
  const [fileText, setFileText] = useState<string>("");
  const [entries, setEntries] = useState<ParsedEntry[]>([]);
  const [csvState, setCsvState] = useState<CSVMappingState | null>(null);
  const [csvMapping, setCsvMapping] = useState<Record<string, string>>({});
  const [csvType, setCsvType] = useState<string>("login");
  const [importedCount, setImportedCount] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: vaults = [] } = useQuery<Vault[]>({
    queryKey: ["vaults"],
    queryFn: () => api.listVaults(),
  });

  const handleFile = useCallback((f: File) => {
    setFile(f);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = (e.target?.result as string) ?? "";
      setFileText(text);
      const detected = detectFormat(f.name, text);
      setFormat(detected);
    };
    reader.readAsText(f);
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleParse = () => {
    if (!format || !fileText) return;
    try {
      if (format === "csv") {
        const state = parseGenericCSVHeaders(fileText);
        setCsvState(state);
        setStep("mapping");
        return;
      }
      let parsed: ParsedEntry[] = [];
      if (format === "bitwarden") parsed = parseBitwarden(fileText);
      else if (format === "lastpass") parsed = parseLastPass(fileText);
      else if (format === "keepass") parsed = parseKeePass(fileText);
      else if (format === "1password") parsed = parse1Password(fileText);
      setEntries(parsed);
      setStep("preview");
    } catch (err) {
      toast({
        title: "Failed to parse file",
        description: err instanceof Error ? err.message : "Check that the file is a valid export.",
        variant: "destructive",
      });
    }
  };

  const handleApplyMapping = () => {
    if (!csvState) return;
    const mapping = { ...csvMapping, __type: csvType };
    const parsed = applyGenericCSVMapping(csvState, mapping);
    setEntries(parsed);
    setStep("preview");
  };

  const handleImport = async () => {
    if (!vaultId || entries.length === 0) return;
    setStep("importing");
    setImportedCount(0);
    setErrors([]);

    const mek = getMEK();
    if (!mek) {
      toast({ title: "Session expired — please log in again", variant: "destructive" });
      setStep("preview");
      return;
    }

    const vault = vaults.find((v) => v.id === vaultId);
    if (!vault) { setStep("preview"); return; }

    let cek: Uint8Array;
    try {
      cek = await unwrapCEK(vault.cek_envelope, mek);
    } catch {
      toast({ title: "Could not decrypt vault key", variant: "destructive" });
      setStep("preview");
      return;
    }

    const errs: string[] = [];
    let count = 0;
    for (const entry of entries) {
      try {
        const payload = { type: entry.entry_type, title: entry.title, ...entry.fields };
        const encrypted_data = await encryptObject(payload, cek);
        await api.createEntry(vaultId, {
          entry_type: entry.entry_type,
          title: entry.title,
          encrypted_data,
        });
        count++;
        setImportedCount(count);
      } catch (err) {
        errs.push(`"${entry.title}": ${err instanceof APIError ? err.message : "failed"}`);
      }
    }

    setErrors(errs);
    setStep("done");
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Import entries</h1>
        <p className="text-sm text-text-secondary mt-1">
          Import from Bitwarden, LastPass, KeePass, or 1Password. Files are parsed locally — nothing is sent to the server unencrypted.
        </p>
      </div>

      {/* Steps indicator */}
      <div className="flex items-center gap-2 text-xs text-text-muted">
        {(["select", "preview", "done"] as const).map((s, i) => (
          <span key={s} className="flex items-center gap-2">
            {i > 0 && <ChevronRight className="h-3 w-3" />}
            <span className={cn(
              "font-medium",
              step === s || (s === "preview" && step === "mapping") || (s === "preview" && step === "importing")
                ? "text-primary"
                : "text-text-muted"
            )}>
              {i + 1}. {s === "select" ? "Choose file" : s === "preview" ? "Review & import" : "Done"}
            </span>
          </span>
        ))}
      </div>

      {/* Step 1: Select vault + file */}
      {step === "select" && (
        <Card>
          <CardContent className="pt-5 space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-primary">Import into vault</label>
              <select
                value={vaultId}
                onChange={(e) => setVaultId(e.target.value)}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="">Select a vault…</option>
                {vaults.map((v) => (
                  <option key={v.id} value={v.id}>{v.icon} {v.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-text-primary">Export file</label>
              <div
                className={cn(
                  "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
                  dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
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
                  accept=".json,.csv,.xml,.tsv"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                />
                {file ? (
                  <div className="flex items-center justify-center gap-3">
                    <FileText className="h-6 w-6 text-primary" />
                    <div className="text-left">
                      <p className="text-sm font-medium text-text-primary">{file.name}</p>
                      <p className="text-xs text-text-muted">
                        {format ? `Detected: ${FORMAT_LABELS[format]}` : "Format not recognized"}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 ml-1"
                      onClick={(e) => { e.stopPropagation(); setFile(null); setFileText(""); setFormat(null); }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="h-8 w-8 text-text-muted mx-auto" />
                    <p className="text-sm text-text-secondary">Drop your export file here, or click to browse</p>
                    <p className="text-xs text-text-muted">Supports .json (Bitwarden), .csv (LastPass, 1Password, generic), .xml (KeePass)</p>
                  </div>
                )}
              </div>
            </div>

            {file && format && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-success-50 border border-success-200">
                <CheckCircle2 className="h-4 w-4 text-success-600 flex-shrink-0" />
                <p className="text-sm text-success-700">
                  Detected <strong>{FORMAT_LABELS[format]}</strong> format
                </p>
              </div>
            )}
            {file && !format && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
                <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                <p className="text-sm text-amber-700">
                  Format not recognized. Try a <strong>Generic CSV</strong> import instead.
                </p>
                <Button size="sm" variant="ghost" className="ml-auto text-xs" onClick={() => { setFormat("csv"); }}>
                  Use CSV
                </Button>
              </div>
            )}

            <div className="flex justify-end">
              <Button
                onClick={handleParse}
                disabled={!vaultId || !file || !format}
              >
                Preview import
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 1b: CSV column mapping */}
      {step === "mapping" && csvState && (
        <Card>
          <CardContent className="pt-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Map CSV columns</h2>
              <p className="text-xs text-text-muted mt-1">
                {csvState.rows.length} rows detected. Match your CSV columns to entry fields.
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-text-secondary">Entry type for all rows</label>
              <select
                value={csvType}
                onChange={(e) => setCsvType(e.target.value)}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                {ENTRY_TYPES.map((t) => (
                  <option key={t} value={t}>{entryTypeIcon(t)} {t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {CSV_TARGET_FIELDS.map(({ field, label }) => (
                <div key={field} className="space-y-1">
                  <label className="text-xs font-medium text-text-secondary">{label}</label>
                  <select
                    value={csvMapping[field] ?? ""}
                    onChange={(e) => setCsvMapping((p) => ({ ...p, [field]: e.target.value }))}
                    className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="">— skip —</option>
                    {csvState.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setStep("select")}>Back</Button>
              <Button onClick={handleApplyMapping}>Preview entries</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Preview */}
      {step === "preview" && (
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-semibold text-text-primary">{entries.length} entries to import</p>
                  <p className="text-xs text-text-muted mt-0.5">
                    Into: {vaults.find((v) => v.id === vaultId)?.name ?? vaultId}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setStep("select")}>Change file</Button>
              </div>

              <div className="border border-border rounded-lg divide-y divide-border max-h-96 overflow-y-auto">
                {entries.map((e, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                    <span className="text-base flex-shrink-0">{entryTypeIcon(e.entry_type)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">{e.title}</p>
                      <p className="text-xs text-text-muted capitalize">{e.entry_type}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setStep("select")}>Cancel</Button>
            <Button onClick={handleImport} disabled={entries.length === 0}>
              Import {entries.length} {entries.length === 1 ? "entry" : "entries"}
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Importing progress */}
      {step === "importing" && (
        <Card>
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <p className="text-sm font-medium text-text-primary">Encrypting and importing…</p>
            <div className="mx-auto max-w-xs space-y-1.5">
              <div className="flex justify-between text-xs text-text-muted">
                <span>{importedCount} of {entries.length}</span>
                <span>{Math.round((importedCount / entries.length) * 100)}%</span>
              </div>
              <div className="h-2 rounded-full bg-surface-muted overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${(importedCount / entries.length) * 100}%` }}
                />
              </div>
            </div>
            <p className="text-xs text-text-muted">Each entry is encrypted locally before being sent</p>
          </CardContent>
        </Card>
      )}

      {/* Done */}
      {step === "done" && (
        <Card>
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <CheckCircle2 className="h-10 w-10 text-success-600 mx-auto" />
            <div>
              <p className="text-lg font-semibold text-text-primary">
                {importedCount} {importedCount === 1 ? "entry" : "entries"} imported
              </p>
              <p className="text-sm text-text-secondary mt-1">
                Into {vaults.find((v) => v.id === vaultId)?.name}
              </p>
            </div>

            {errors.length > 0 && (
              <div className="text-left max-h-40 overflow-y-auto border border-destructive/20 rounded-lg p-3 bg-destructive-50">
                <p className="text-xs font-medium text-destructive mb-1">{errors.length} failed:</p>
                {errors.map((e, i) => (
                  <p key={i} className="text-xs text-destructive-700 truncate">{e}</p>
                ))}
              </div>
            )}

            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={() => {
                setStep("select");
                setFile(null);
                setFileText("");
                setFormat(null);
                setEntries([]);
                setErrors([]);
                setImportedCount(0);
              }}>
                Import another file
              </Button>
              <Button onClick={() => {
                window.location.href = `/vaults/${vaultId}`;
              }}>
                Go to vault
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
