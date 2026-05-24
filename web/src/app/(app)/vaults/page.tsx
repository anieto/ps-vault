"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  Plus,
  LockKeyhole as Vault,
  ChevronRight,
  Trash2,
  MoreHorizontal,
  Eye,
  Pencil,
} from "lucide-react";
import { api, APIError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/components/ui/toaster";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { getMEK } from "@/lib/crypto";
import * as crypto from "@/lib/crypto";
import type { Vault as VaultType } from "@/types";

const createVaultSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(500).optional(),
});

type CreateVaultForm = z.infer<typeof createVaultSchema>;

export default function VaultsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["vaults"],
    queryFn: () => api.listVaults() as Promise<VaultType[]>,
  });

  const vaults = data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Vaults</h1>
          <p className="text-sm text-text-secondary mt-1">
            Organize your important information into vaults.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          New vault
        </Button>
      </div>

      {showCreate && (
        <CreateVaultForm
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            queryClient.invalidateQueries({ queryKey: ["vaults"] });
          }}
        />
      )}

      {isLoading ? (
        <VaultListSkeleton />
      ) : vaults.length === 0 ? (
        <EmptyVaults onCreateClick={() => setShowCreate(true)} />
      ) : (
        <div className="space-y-3">
          {vaults.map((vault) => (
            <VaultCard key={vault.id} vault={vault} />
          ))}
        </div>
      )}
    </div>
  );
}

function CreateVaultForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateVaultForm>({
    resolver: zodResolver(createVaultSchema),
  });

  const mutation = useMutation({
    mutationFn: async (data: CreateVaultForm) => {
      const mek = getMEK();
      if (!mek) throw new Error("Session expired. Please sign in again.");

      const cek = await crypto.generateCEK();
      const cekEnvelope = await crypto.wrapCEK(cek, mek);

      return api.createVault({
        name: data.name,
        description: data.description,
        cek_envelope: cekEnvelope,
      });
    },
    onSuccess: () => {
      toast({ title: "Vault created", variant: "success" });
      onCreated();
    },
    onError: (err) => {
      const msg = err instanceof APIError ? err.message : (err as Error).message;
      toast({ title: msg, variant: "destructive" });
    },
  });

  return (
    <Card>
      <CardContent className="pt-5">
        <h2 className="text-base font-medium text-text-primary mb-4">New vault</h2>
        <form
          onSubmit={handleSubmit((d) => mutation.mutate(d))}
          className="space-y-4"
        >
          <Input
            label="Name"
            placeholder="e.g. Financial accounts, Digital life..."
            error={errors.name?.message}
            {...register("name")}
          />
          <Input
            label="Description"
            placeholder="Optional — a brief note about what's inside"
            error={errors.description?.message}
            {...register("description")}
          />
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              Create vault
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function VaultCard({ vault }: { vault: VaultType }) {
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteVault(vault.id),
    onSuccess: () => {
      toast({ title: "Vault deleted", variant: "default" });
      queryClient.invalidateQueries({ queryKey: ["vaults"] });
    },
    onError: (err) => {
      const msg = err instanceof APIError ? err.message : "Failed to delete vault";
      toast({ title: msg, variant: "destructive" });
    },
  });

  const handleDelete = () => {
    if (confirm(`Delete "${vault.name}"? This cannot be undone.`)) {
      deleteMutation.mutate();
    }
    setMenuOpen(false);
  };

  return (
    <div className="relative group flex items-center justify-between px-4 py-3.5 rounded-lg border border-border bg-surface hover:border-primary/30 hover:shadow-card transition-all">
      <Link href={`/vaults/${vault.id}`} className="flex items-center gap-3 min-w-0 flex-1">
        <div className="h-8 w-8 rounded-md bg-primary-50 flex items-center justify-center flex-shrink-0">
          <Vault className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-primary truncate">{vault.name}</p>
          {vault.description && (
            <p className="text-xs text-text-muted truncate mt-0.5">{vault.description}</p>
          )}
        </div>
      </Link>

      <div className="flex items-center gap-1 ml-3 flex-shrink-0">
        <Button asChild size="icon" variant="ghost" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
          <Link href={`/vaults/${vault.id}`} title="View vault">
            <ChevronRight className="h-4 w-4" />
          </Link>
        </Button>
        <div className="relative">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-8 z-20 w-40 rounded-lg border border-border bg-surface shadow-dialog py-1">
                <Link
                  href={`/vaults/${vault.id}`}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-surface-muted"
                  onClick={() => setMenuOpen(false)}
                >
                  <Eye className="h-3.5 w-3.5" /> View
                </Link>
                <Link
                  href={`/vaults/${vault.id}?edit=true`}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-surface-muted"
                  onClick={() => setMenuOpen(false)}
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Link>
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive-50"
                  onClick={handleDelete}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyVaults({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-14 gap-4">
        <div className="h-12 w-12 rounded-full bg-primary-50 flex items-center justify-center">
          <Vault className="h-6 w-6 text-primary" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-text-primary">No vaults yet</p>
          <p className="text-xs text-text-muted mt-1 max-w-xs">
            Create a vault to start organizing important information for your loved ones.
          </p>
        </div>
        <Button onClick={onCreateClick} className="gap-2">
          <Plus className="h-4 w-4" />
          Create your first vault
        </Button>
      </CardContent>
    </Card>
  );
}

function VaultListSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-16 rounded-lg skeleton" />
      ))}
    </div>
  );
}
