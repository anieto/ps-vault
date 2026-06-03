"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users,
  ShieldAlert,
  HardDrive,
  Mail,
  Settings2,
  Palette,
  TicketCheck,
  ScrollText,
  LayoutDashboard,
  Database,
  FileStack,
  Loader2,
  LogOut,
  Ban,
  CheckCircle2,
  Trash2,
  RefreshCw,
  Copy,
  Check,
  Download,
  ShieldPlus,
  ShieldMinus,
} from "lucide-react";
import { api, APIError } from "@/lib/api";
import { applyAccentColor } from "@/lib/branding";
import { Button } from "@/components/ui/button";
import { Input, NumberInput } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toaster";
import { useAuthStore } from "@/store/auth";
import { formatDate, formatBytes } from "@/lib/utils";

export default function AdminPage() {
  const { user } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (user && user.role !== "admin") {
      router.replace("/dashboard");
    }
  }, [user, router]);

  if (!user || user.role !== "admin") return null;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Admin Panel</h1>
        <p className="text-sm text-text-secondary mt-1">
          Manage users, configuration, and system health.
        </p>
      </div>

      <DashboardSection />
      <UsersSection />
      <ConfigSection />
      <InvitesSection />
      <BrandingSection />
      <EmailQueueSection />
      <AuditLogSection />

      {/* Attribution */}
      <p className="text-center text-xs text-text-muted/60 pb-4">
        Powered by{" "}
        <a
          href="https://psvault.dev"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-text-muted transition-colors"
        >
          P.S. Vault
        </a>
      </p>
    </div>
  );
}

// ── Dashboard ──────────────────────────────────────────────────────────────

function DashboardSection() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: () => api.getAdminDashboard() as Promise<{
      total_users: number;
      total_vaults: number;
      total_entries: number;
      storage_used_bytes: number;
      switch_status: Record<string, number>;
    }>,
  });

  return (
    <section>
      <SectionHeader icon={<LayoutDashboard className="h-4 w-4" />} title="Dashboard" />
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-20 rounded-xl skeleton" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Users" value={data?.total_users ?? 0} icon={<Users className="h-4 w-4" />} />
          <StatCard label="Vaults" value={data?.total_vaults ?? 0} icon={<Database className="h-4 w-4" />} />
          <StatCard label="Entries" value={data?.total_entries ?? 0} icon={<FileStack className="h-4 w-4" />} />
          <StatCard
            label="Storage used"
            value={formatBytes(data?.storage_used_bytes ?? 0)}
            icon={<HardDrive className="h-4 w-4" />}
          />
        </div>
      )}
      {data?.switch_status && (
        <div className="mt-3 flex flex-wrap gap-2">
          {Object.entries(data.switch_status).map(([status, count]) => (
            <span key={status} className="text-xs px-2 py-1 rounded-full bg-surface border border-border text-text-secondary">
              {status}: <strong>{count}</strong>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number | string; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center gap-2 mb-1 text-text-muted">{icon}<span className="text-xs">{label}</span></div>
        <p className="text-2xl font-semibold text-text-primary">{value}</p>
      </CardContent>
    </Card>
  );
}

// ── Users ─────────────────────────────────────────────────────────────────

type AdminUser = {
  id: string;
  email: string;
  display_name: string;
  role: string;
  is_active: boolean;
  mfa_enabled: boolean;
  vault_count: number;
  storage_used_bytes: number;
  last_login_at: string | null;
  created_at: string;
};

function UsersSection() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const limit = 20;

  const { data, isLoading } = useQuery({
    queryKey: ["admin-users", page],
    queryFn: () => api.listAdminUsers(limit, page * limit) as Promise<{ users: AdminUser[]; total: number }>,
  });

  const users = data?.users ?? [];
  const total = data?.total ?? 0;

  const disableMutation = useMutation({
    mutationFn: (id: string) => api.disableUser(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-users"] }); toast({ title: "User disabled", variant: "success" }); },
    onError: (e) => toast({ title: e instanceof APIError ? e.message : "Failed", variant: "destructive" }),
  });
  const enableMutation = useMutation({
    mutationFn: (id: string) => api.enableUser(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-users"] }); toast({ title: "User enabled", variant: "success" }); },
    onError: (e) => toast({ title: e instanceof APIError ? e.message : "Failed", variant: "destructive" }),
  });
  const logoutMutation = useMutation({
    mutationFn: (id: string) => api.forceLogoutUser(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-users"] }); toast({ title: "Sessions revoked", variant: "success" }); },
    onError: (e) => toast({ title: e instanceof APIError ? e.message : "Failed", variant: "destructive" }),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteAdminUser(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-users"] }); toast({ title: "User deleted", variant: "success" }); },
    onError: (e) => toast({ title: e instanceof APIError ? e.message : "Failed", variant: "destructive" }),
  });

  const { user: currentUser } = useAuthStore();
  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) => api.setUserRole(id, role),
    onSuccess: (_, { role }) => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast({ title: role === "admin" ? "User promoted to admin" : "Admin demoted to user", variant: "success" });
    },
    onError: (e) => toast({ title: e instanceof APIError ? e.message : "Failed", variant: "destructive" }),
  });

  return (
    <section>
      <SectionHeader icon={<Users className="h-4 w-4" />} title={`Users${total > 0 ? ` (${total})` : ""}`} />
      <Card>
        <CardContent className="pt-0 px-0 overflow-x-auto">
          {isLoading ? (
            <div className="h-40 skeleton m-4 rounded-lg" />
          ) : users.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-8">No users found.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-text-muted">
                  <th className="px-4 py-3 text-left font-medium">User</th>
                  <th className="px-4 py-3 text-left font-medium">Role</th>
                  <th className="px-4 py-3 text-left font-medium">Vaults</th>
                  <th className="px-4 py-3 text-left font-medium">Storage</th>
                  <th className="px-4 py-3 text-left font-medium">Last login</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-border last:border-0 hover:bg-surface-muted/40">
                    <td className="px-4 py-3">
                      <p className="font-medium text-text-primary">{u.display_name}</p>
                      <p className="text-xs text-text-muted">{u.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${u.role === "admin" ? "bg-primary-50 text-primary-700" : "bg-surface border border-border text-text-secondary"}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{u.vault_count}</td>
                    <td className="px-4 py-3 text-text-secondary text-xs">{formatBytes(u.storage_used_bytes ?? 0)}</td>
                    <td className="px-4 py-3 text-text-secondary text-xs">
                      {u.last_login_at ? formatDate(u.last_login_at) : "Never"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${u.is_active ? "bg-sage-50 text-sage-700" : "bg-rose-50 text-rose-700"}`}>
                        {u.is_active ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {u.is_active ? (
                          <ActionButton
                            icon={<Ban className="h-3.5 w-3.5" />}
                            label="Disable"
                            onClick={() => disableMutation.mutate(u.id)}
                            loading={disableMutation.isPending}
                          />
                        ) : (
                          <ActionButton
                            icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                            label="Enable"
                            onClick={() => enableMutation.mutate(u.id)}
                            loading={enableMutation.isPending}
                          />
                        )}
                        <ActionButton
                          icon={<LogOut className="h-3.5 w-3.5" />}
                          label="Force logout"
                          onClick={() => logoutMutation.mutate(u.id)}
                          loading={logoutMutation.isPending}
                        />
                        {u.id !== currentUser?.id && (
                          u.role === "admin" ? (
                            <ActionButton
                              icon={<ShieldMinus className="h-3.5 w-3.5" />}
                              label="Remove admin"
                              onClick={() => {
                                if (confirm(`Remove admin role from ${u.email}?`)) {
                                  roleMutation.mutate({ id: u.id, role: "user" });
                                }
                              }}
                              loading={roleMutation.isPending}
                            />
                          ) : (
                            <ActionButton
                              icon={<ShieldPlus className="h-3.5 w-3.5" />}
                              label="Make admin"
                              onClick={() => {
                                if (confirm(`Grant admin role to ${u.email}?`)) {
                                  roleMutation.mutate({ id: u.id, role: "admin" });
                                }
                              }}
                              loading={roleMutation.isPending}
                            />
                          )
                        )}
                        {u.role !== "admin" && (
                          <ActionButton
                            icon={<Trash2 className="h-3.5 w-3.5" />}
                            label="Delete"
                            onClick={() => {
                              if (confirm(`Delete ${u.email}? This cannot be undone.`)) {
                                deleteMutation.mutate(u.id);
                              }
                            }}
                            loading={deleteMutation.isPending}
                            destructive
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
      {total > limit && (
        <div className="flex items-center justify-between mt-2 text-sm text-text-secondary">
          <span>Showing {page * limit + 1}–{Math.min((page + 1) * limit, total)} of {total}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button size="sm" variant="outline" disabled={(page + 1) * limit >= total} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </section>
  );
}

// ── Invites ───────────────────────────────────────────────────────────────

type InviteCode = {
  id: string;
  code: string;
  expires_at: string;
  used_at: string | null;
  used_by: string | null;
  created_at: string;
};

function InvitesSection() {
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sendEmail, setSendEmail] = useState("");

  const { data: rawInvites, isLoading } = useQuery({
    queryKey: ["admin-invites"],
    queryFn: () => api.listInvites() as Promise<InviteCode[]>,
  });
  const invites = rawInvites ?? [];

  const createMutation = useMutation({
    mutationFn: () => api.createInvite(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-invites"] }),
    onError: (e) => toast({ title: e instanceof APIError ? e.message : "Failed", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteInvite(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-invites"] }); toast({ title: "Invite revoked", variant: "success" }); },
    onError: (e) => toast({ title: e instanceof APIError ? e.message : "Failed", variant: "destructive" }),
  });

  const sendMutation = useMutation({
    mutationFn: ({ id, email }: { id: string; email: string }) => api.sendInviteEmail(id, email),
    onSuccess: () => {
      toast({ title: "Invite email sent", variant: "success" });
      setSendingId(null);
      setSendEmail("");
    },
    onError: (e) => toast({ title: e instanceof APIError ? e.message : "Failed to send", variant: "destructive" }),
  });

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(code);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <SectionHeader icon={<TicketCheck className="h-4 w-4" />} title="Invite Codes" noMargin />
        <Button size="sm" loading={createMutation.isPending} onClick={() => createMutation.mutate()}>
          Generate invite
        </Button>
      </div>
      <Card>
        <CardContent className="pt-4">
          {isLoading ? (
            <div className="h-20 skeleton rounded-lg" />
          ) : invites.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-4">No invite codes yet.</p>
          ) : (
            <div className="space-y-1">
              {invites.map((ic) => (
                <div key={ic.id} className="border-b border-border last:border-0 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 overflow-hidden">
                      <code className="text-sm font-mono text-text-primary block truncate">{ic.code}</code>
                      <p className="text-xs text-text-muted mt-0.5">
                        {ic.used_at
                          ? `Used ${formatDate(ic.used_at)}`
                          : `Expires ${formatDate(ic.expires_at)}`}
                      </p>
                    </div>
                    {!ic.used_at && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button size="sm" variant="ghost" onClick={() => copyCode(ic.code)}>
                          {copied === ic.code ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => { setSendingId(sendingId === ic.id ? null : ic.id); setSendEmail(""); }}
                        >
                          <Mail className="h-3.5 w-3.5" />
                        </Button>
                        <ActionButton
                          icon={<Trash2 className="h-3.5 w-3.5" />}
                          label="Revoke"
                          onClick={() => {
                            if (confirm("Revoke this invite code? It will no longer be usable.")) {
                              deleteMutation.mutate(ic.id);
                            }
                          }}
                          loading={deleteMutation.isPending}
                          destructive
                        />
                      </div>
                    )}
                  </div>
                  {sendingId === ic.id && (
                    <div className="flex items-center gap-2 mt-2">
                      <Input
                        type="email"
                        placeholder="recipient@example.com"
                        value={sendEmail}
                        onChange={(e) => setSendEmail(e.target.value)}
                        className="flex-1 text-sm"
                      />
                      <Button
                        size="sm"
                        loading={sendMutation.isPending}
                        onClick={() => sendMutation.mutate({ id: ic.id, email: sendEmail })}
                      >
                        Send
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setSendingId(null)}>Cancel</Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

// ── Config ────────────────────────────────────────────────────────────────

function ConfigSection() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [smtpTestEmail, setSmtpTestEmail] = useState("");
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [testingStorage, setTestingStorage] = useState(false);

  const { data: config = {}, isLoading } = useQuery({
    queryKey: ["admin-config"],
    queryFn: () => api.getAdminConfig() as Promise<Record<string, string>>,
  });

  const mutation = useMutation({
    mutationFn: (data: Record<string, string>) => api.updateAdminConfig(data),
    onSuccess: () => {
      toast({ title: "Configuration saved", variant: "success" });
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ["admin-config"] });
    },
    onError: (e) => toast({ title: e instanceof APIError ? e.message : "Failed to save", variant: "destructive" }),
  });

  const handleEdit = () => {
    setForm({
      max_file_size_mb: config.max_file_size_mb ?? "100",
      registration_mode: config.registration_mode ?? "invite",
      login_counts_as_checkin: config.login_counts_as_checkin ?? "true",
      downtime_grace_threshold_hours: config.downtime_grace_threshold_hours ?? "1",
      cascade_window_default: config.cascade_window_default ?? "14",
      storage_backend: config.storage_backend ?? "local",
      s3_endpoint: config.s3_endpoint ?? "",
      s3_bucket: config.s3_bucket ?? "",
      s3_region: config.s3_region ?? "",
      s3_access_key: config.s3_access_key ?? "",
      s3_secret_key: config.s3_secret_key ?? "",
      smtp_host_override: config.smtp_host_override ?? "",
      smtp_port_override: config.smtp_port_override ?? "",
      smtp_user_override: config.smtp_user_override ?? "",
      smtp_pass_override: config.smtp_pass_override ?? "",
      smtp_from_override: config.smtp_from_override ?? "",
      smtp_tls_override: config.smtp_tls_override ?? "tls",
    });
    setEditing(true);
  };

  const handleTestSMTP = async () => {
    if (!smtpTestEmail) { toast({ title: "Enter an email address to test with", variant: "destructive" }); return; }
    setTestingSmtp(true);
    try {
      await api.testSMTP(smtpTestEmail);
      toast({ title: "Test email sent", variant: "success" });
    } catch (e) {
      toast({ title: e instanceof APIError ? e.message : "SMTP test failed", variant: "destructive" });
    } finally {
      setTestingSmtp(false);
    }
  };

  const handleTestStorage = async () => {
    setTestingStorage(true);
    try {
      await api.testStorage();
      toast({ title: "Storage connection OK", variant: "success" });
    } catch (e) {
      toast({ title: e instanceof APIError ? e.message : "Storage test failed", variant: "destructive" });
    } finally {
      setTestingStorage(false);
    }
  };

  const isS3 = (editing ? form.storage_backend : (config.storage_backend ?? "local")) === "s3";

  return (
    <section>
      <SectionHeader icon={<Settings2 className="h-4 w-4" />} title="System Configuration" />
      <Card>
        <CardContent className="pt-5">
          {isLoading ? (
            <div className="h-24 skeleton rounded-lg" />
          ) : editing ? (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <NumberInput
                  label="Max file upload size (MB)"
                  value={form.max_file_size_mb}
                  onChange={(e) => setForm(f => ({ ...f, max_file_size_mb: e.target.value }))}
                  suggestions={[50, 100, 200, 500, 1000]}
                />
                <div className="space-y-1">
                  <label className="text-xs font-medium text-text-secondary">Registration mode</label>
                  <select
                    value={form.registration_mode}
                    onChange={(e) => setForm(f => ({ ...f, registration_mode: e.target.value }))}
                    className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="open">Open — anyone can register</option>
                    <option value="invite">Invite only</option>
                    <option value="closed">Closed — no new registrations</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-text-secondary">Login counts as check-in</label>
                  <select
                    value={form.login_counts_as_checkin}
                    onChange={(e) => setForm(f => ({ ...f, login_counts_as_checkin: e.target.value }))}
                    className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="true">Yes — logging in resets the check-in timer</option>
                    <option value="false">No — only explicit check-ins reset the timer</option>
                  </select>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <NumberInput
                    label="Downtime grace threshold (hours)"
                    hint="If the server was offline longer than this, affected check-in timers are reset and users are notified rather than triggered."
                    value={form.downtime_grace_threshold_hours}
                    onChange={(e) => setForm(f => ({ ...f, downtime_grace_threshold_hours: e.target.value }))}
                    suggestions={[1, 2, 4, 6, 12, 24]}
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <NumberInput
                    label="Cascade window default (days)"
                    hint="Default number of days each tier waits before the next tier unlocks when a vault uses cascading delivery. Applied at vault creation time."
                    value={form.cascade_window_default}
                    onChange={(e) => setForm(f => ({ ...f, cascade_window_default: e.target.value }))}
                    suggestions={[7, 14, 21, 30]}
                  />
                </div>
              </div>

              <hr className="border-border" />
              <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Storage Backend</p>
              <div className="space-y-1">
                <label className="text-xs font-medium text-text-secondary">Backend</label>
                <select
                  value={form.storage_backend}
                  onChange={(e) => setForm(f => ({ ...f, storage_backend: e.target.value }))}
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="local">Local disk</option>
                  <option value="s3">S3-compatible (AWS S3, MinIO, Backblaze B2, Cloudflare R2)</option>
                </select>
              </div>
              {isS3 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input label="S3 Endpoint" placeholder="s3.amazonaws.com" value={form.s3_endpoint} onChange={(e) => setForm(f => ({ ...f, s3_endpoint: e.target.value }))} />
                  <Input label="Bucket" placeholder="my-vault-files" value={form.s3_bucket} onChange={(e) => setForm(f => ({ ...f, s3_bucket: e.target.value }))} />
                  <Input label="Region" placeholder="us-east-1" value={form.s3_region} onChange={(e) => setForm(f => ({ ...f, s3_region: e.target.value }))} />
                  <Input label="Access Key" value={form.s3_access_key} onChange={(e) => setForm(f => ({ ...f, s3_access_key: e.target.value }))} />
                  <Input label="Secret Key" type="password" value={form.s3_secret_key} onChange={(e) => setForm(f => ({ ...f, s3_secret_key: e.target.value }))} />
                </div>
              )}

              <hr className="border-border" />
              <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">SMTP Configuration</p>
              <p className="text-xs text-text-muted -mt-3">Override the SMTP settings from your environment variables. Leave blank to use env defaults.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input label="SMTP host" placeholder="smtp.example.com" value={form.smtp_host_override} onChange={(e) => setForm(f => ({ ...f, smtp_host_override: e.target.value }))} />
                <Input label="SMTP port" placeholder="587" value={form.smtp_port_override} onChange={(e) => setForm(f => ({ ...f, smtp_port_override: e.target.value }))} />
                <Input label="SMTP username" placeholder="user@example.com" value={form.smtp_user_override} onChange={(e) => setForm(f => ({ ...f, smtp_user_override: e.target.value }))} />
                <Input label="SMTP password" type="password" placeholder="••••••••" value={form.smtp_pass_override} onChange={(e) => setForm(f => ({ ...f, smtp_pass_override: e.target.value }))} />
                <Input label="From address" placeholder="noreply@example.com" value={form.smtp_from_override} onChange={(e) => setForm(f => ({ ...f, smtp_from_override: e.target.value }))} />
                <div className="space-y-1">
                  <label className="text-xs font-medium text-text-secondary">TLS mode</label>
                  <select
                    value={form.smtp_tls_override}
                    onChange={(e) => setForm(f => ({ ...f, smtp_tls_override: e.target.value }))}
                    className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="tls">TLS (port 465)</option>
                    <option value="starttls">STARTTLS (port 587)</option>
                    <option value="none">None (port 25)</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                <Button size="sm" loading={mutation.isPending} onClick={() => mutation.mutate(form)}>Save</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="space-y-1.5 flex-1 min-w-0">
                  <InfoRow label="Max upload size" value={`${config.max_file_size_mb ?? "—"} MB`} />
                  <InfoRow label="Registration" value={
                    config.registration_mode === "open" ? "Open"
                    : config.registration_mode === "closed" ? "Closed"
                    : "Invite only"
                  } />
                  <InfoRow
                    label="Login counts as check-in"
                    value={(config.login_counts_as_checkin ?? "true") === "false" ? "No — explicit check-in only" : "Yes — login resets timer"}
                  />
                  <InfoRow
                    label="Downtime grace threshold"
                    value={`${config.downtime_grace_threshold_hours ?? "1"} hour${(config.downtime_grace_threshold_hours ?? "1") === "1" ? "" : "s"} — timers reset instead of trigger if server was offline longer than this`}
                  />
                  <InfoRow
                    label="Cascade window default"
                    value={`${config.cascade_window_default ?? "14"} day${(config.cascade_window_default ?? "14") === "1" ? "" : "s"} — per-tier delay for cascading vault delivery`}
                  />
                  <InfoRow label="Storage backend" value={config.storage_backend === "s3" ? "S3-compatible" : "Local disk"} />
                  {config.storage_backend === "s3" && config.s3_bucket && (
                    <InfoRow label="S3 bucket" value={config.s3_bucket} />
                  )}
                </div>
                <Button size="sm" variant="outline" onClick={handleEdit} className="self-start">Edit</Button>
              </div>
              <hr className="border-border" />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-text-secondary">Test storage connection</p>
                  <p className="text-xs text-text-muted mt-0.5">
                    {config.storage_backend === "s3"
                      ? `S3-compatible${config.s3_bucket ? ` — ${config.s3_bucket}` : ""}`
                      : "Local disk"}
                  </p>
                </div>
                <Button size="sm" variant="outline" loading={testingStorage} onClick={handleTestStorage}>
                  Test storage
                </Button>
              </div>
              <hr className="border-border" />
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">SMTP</p>
                {config.smtp_host_override ? (
                  <>
                    <InfoRow label="Host" value={`${config.smtp_host_override}${config.smtp_port_override ? `:${config.smtp_port_override}` : ""}`} />
                    <InfoRow label="From" value={config.smtp_from_override || "—"} />
                    <InfoRow label="TLS mode" value={config.smtp_tls_override || "tls"} />
                  </>
                ) : (
                  <p className="text-xs text-text-muted">No overrides configured — email is sent using the SMTP credentials set via environment variables (SMTP_HOST, SMTP_PORT, SMTP_USER, etc.).</p>
                )}
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Input
                    label="Test SMTP — send a test email to"
                    type="email"
                    placeholder="you@example.com"
                    value={smtpTestEmail}
                    onChange={(e) => setSmtpTestEmail(e.target.value)}
                  />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  loading={testingSmtp}
                  onClick={handleTestSMTP}
                  className="mb-0.5"
                >
                  Send test
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

// ── Branding ──────────────────────────────────────────────────────────────

function BrandingSection() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [appName, setAppName] = useState("");
  const [accentColor, setAccentColor] = useState("");

  const { data: config = {}, isLoading } = useQuery({
    queryKey: ["admin-config"],
    queryFn: () => api.getAdminConfig() as Promise<Record<string, string>>,
  });

  const mutation = useMutation({
    mutationFn: (data: Record<string, string>) => api.updateAdminConfig(data),
    onSuccess: (_, variables) => {
      toast({ title: "Branding saved", variant: "success" });
      setEditing(false);
      // Apply color immediately without waiting for a refetch
      if (variables.app_accent_color) applyAccentColor(variables.app_accent_color);
      // Update branding cache directly so sidebar name & BrandingApplier update instantly
      queryClient.setQueryData(["branding"], {
        app_name: variables.app_name_override ?? "",
        accent_color: variables.app_accent_color ?? "",
      });
      queryClient.invalidateQueries({ queryKey: ["admin-config"] });
    },
    onError: (e) => toast({ title: e instanceof APIError ? e.message : "Failed to save", variant: "destructive" }),
  });

  const handleEdit = () => {
    setAppName(config.app_name_override ?? "");
    setAccentColor(config.app_accent_color || "#3b82f6");
    setEditing(true);
  };

  return (
    <section>
      <SectionHeader icon={<Palette className="h-4 w-4" />} title="Branding" />
      <Card>
        <CardContent className="pt-5">
          {isLoading ? <div className="h-16 skeleton rounded-lg" /> : editing ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="App name override"
                  placeholder="P.S. Vault"
                  hint="Leave blank to use the default"
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                />
                <div className="space-y-1">
                  <label className="text-xs font-medium text-text-secondary">Accent color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={accentColor || "#3b82f6"}
                      onChange={(e) => setAccentColor(e.target.value)}
                      className="h-9 w-12 rounded border border-border cursor-pointer"
                    />
                    <Input
                      placeholder="#3b82f6"
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                <Button size="sm" loading={mutation.isPending} onClick={() => mutation.mutate({ app_name_override: appName, app_accent_color: accentColor })}>
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <InfoRow label="App name" value={config.app_name_override || "P.S. Vault (default)"} />
                <div className="flex items-center gap-4 py-0.5">
                  <span className="text-xs text-text-muted whitespace-nowrap w-44 flex-shrink-0">Accent color</span>
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-4 h-4 rounded border border-border flex-shrink-0" style={{ background: config.app_accent_color || "#3b82f6" }} />
                    <span className="text-sm text-text-primary font-mono">{config.app_accent_color || "#3b82f6 (default)"}</span>
                  </div>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={handleEdit}>Edit</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

// ── Email Queue ───────────────────────────────────────────────────────────

type EmailQueueEntry = {
  id: string;
  to_email: string;
  subject: string;
  template_name: string;
  status: string;
  attempts: number;
  error_message: string | null;
  created_at: string;
};

function EmailQueueSection() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-email-queue", statusFilter],
    queryFn: () => api.getEmailQueue(statusFilter || undefined) as Promise<{ entries: EmailQueueEntry[]; total: number }>,
  });

  const entries = data?.entries ?? [];

  const retryMutation = useMutation({
    mutationFn: (id: string) => api.retryEmail(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-email-queue"] }); toast({ title: "Email queued for retry", variant: "success" }); },
    onError: (e) => toast({ title: e instanceof APIError ? e.message : "Failed", variant: "destructive" }),
  });

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <SectionHeader icon={<Mail className="h-4 w-4" />} title="Email Queue" noMargin />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="text-sm rounded-md border border-border bg-surface px-2 py-1 text-text-secondary focus:outline-none focus:ring-1 focus:ring-primary/50"
        >
          <option value="">All</option>
          <option value="pending">Pending</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
        </select>
      </div>
      <Card>
        <CardContent className="pt-0 px-0 overflow-x-auto">
          {isLoading ? <div className="h-32 skeleton m-4 rounded-lg" /> : entries.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-8">No emails found.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-text-muted">
                  <th className="px-4 py-3 text-left font-medium">To</th>
                  <th className="px-4 py-3 text-left font-medium">Template</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Attempts</th>
                  <th className="px-4 py-3 text-left font-medium">Sent</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-b border-border last:border-0 hover:bg-surface-muted/40">
                    <td className="px-4 py-3 text-text-primary">{e.to_email}</td>
                    <td className="px-4 py-3 text-text-secondary font-mono text-xs">{e.template_name}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={e.status} />
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{e.attempts}</td>
                    <td className="px-4 py-3 text-text-muted text-xs">{formatDate(e.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      {e.status === "failed" && (
                        <ActionButton
                          icon={<RefreshCw className="h-3.5 w-3.5" />}
                          label="Retry"
                          onClick={() => retryMutation.mutate(e.id)}
                          loading={retryMutation.isPending}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

// ── Audit Log ─────────────────────────────────────────────────────────────

type AuditEntry = {
  id: string;
  user_id: string;
  event_type: string;
  event_data: string;
  ip_address: string;
  created_at: string;
};

function AuditLogSection() {
  const [eventFilter, setEventFilter] = useState("");
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);
  const limit = 30;

  const handleExport = async () => {
    setExporting(true);
    try {
      const blob = await api.exportAuditLog({ event_type: eventFilter || undefined });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "audit-log.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({ title: e instanceof APIError ? e.message : "Export failed", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const { data, isLoading } = useQuery({
    queryKey: ["admin-audit-log", eventFilter, page],
    queryFn: () => api.getAdminAuditLog({ event_type: eventFilter || undefined, limit, offset: page * limit }) as Promise<{ entries: AuditEntry[]; total: number }>,
  });

  const entries = data?.entries ?? [];
  const total = data?.total ?? 0;

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <SectionHeader icon={<ScrollText className="h-4 w-4" />} title="Audit Log" noMargin />
        <div className="flex items-center gap-2">
          <Input
            placeholder="Filter by event type"
            value={eventFilter}
            onChange={(e) => { setEventFilter(e.target.value); setPage(0); }}
            className="w-48 text-sm"
          />
          <Button size="sm" variant="outline" loading={exporting} onClick={handleExport}>
            <Download className="h-3.5 w-3.5 mr-1" />
            Export CSV
          </Button>
        </div>
      </div>
      <Card>
        <CardContent className="pt-0 px-0 overflow-x-auto">
          {isLoading ? <div className="h-32 skeleton m-4 rounded-lg" /> : entries.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-8">No audit events found.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-text-muted">
                  <th className="px-4 py-3 text-left font-medium">Event</th>
                  <th className="px-4 py-3 text-left font-medium">User ID</th>
                  <th className="px-4 py-3 text-left font-medium">IP</th>
                  <th className="px-4 py-3 text-left font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-b border-border last:border-0 hover:bg-surface-muted/40">
                    <td className="px-4 py-3 font-mono text-xs text-text-primary">{e.event_type}</td>
                    <td className="px-4 py-3 text-text-muted font-mono text-xs">{e.user_id?.slice(0, 8)}…</td>
                    <td className="px-4 py-3 text-text-muted text-xs">{e.ip_address}</td>
                    <td className="px-4 py-3 text-text-muted text-xs whitespace-nowrap">{formatDate(e.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
      {total > limit && (
        <div className="flex items-center justify-between mt-2 text-sm text-text-secondary">
          <span>Showing {page * limit + 1}–{Math.min((page + 1) * limit, total)} of {total}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button size="sm" variant="outline" disabled={(page + 1) * limit >= total} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </section>
  );
}

// ── Shared components ─────────────────────────────────────────────────────

function SectionHeader({ icon, title, noMargin }: { icon: React.ReactNode; title: string; noMargin?: boolean }) {
  return (
    <h2 className={`text-base font-semibold text-text-primary flex items-center gap-2 ${noMargin ? "" : "mb-3"}`}>
      {icon}{title}
    </h2>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:gap-4 py-0.5 gap-0.5">
      <span className="text-xs text-text-muted sm:whitespace-nowrap sm:w-44 sm:flex-shrink-0">{label}</span>
      <span className="text-sm text-text-primary">{value}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "sent" ? "bg-sage-50 text-sage-700"
    : status === "failed" ? "bg-rose-50 text-rose-700"
    : "bg-amber-50 text-amber-700";
  return <span className={`text-xs px-2 py-0.5 rounded-full ${cls}`}>{status}</span>;
}

function ActionButton({
  icon, label, onClick, loading, destructive,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  loading?: boolean;
  destructive?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      title={label}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors disabled:opacity-50
        ${destructive
          ? "text-rose-600 hover:bg-rose-50"
          : "text-text-secondary hover:bg-surface-muted hover:text-text-primary"
        }`}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}
    </button>
  );
}
