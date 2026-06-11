import type {
  User,
  SwitchSettings,
  Vault,
  VaultEntry,
  VaultEntryVersion,
  VaultFile,
  Beneficiary,
  BeneficiaryVaultItem,
  TrustedContact,
  AuthResponse,
  RecoverValidateResponse,
} from "@/types";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api/v1";

class APIClient {
  private accessToken: string | null = null;
  private refreshing: Promise<void> | null = null;
  private onTokenRefreshed: ((token: string, user: User) => void) | null = null;
  private onAuthFailure: (() => void) | null = null;

  setToken(token: string | null) {
    this.accessToken = token;
  }

  setOnTokenRefreshed(cb: (token: string, user: User) => void) {
    this.onTokenRefreshed = cb;
  }

  setOnAuthFailure(cb: () => void) {
    this.onAuthFailure = cb;
  }

  private async doFetch(path: string, options: RequestInit): Promise<Response> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };

    if (this.accessToken) {
      headers["Authorization"] = `Bearer ${this.accessToken}`;
    }

    return fetch(`${BASE_URL}${path}`, {
      ...options,
      headers,
      credentials: "include",
    });
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    let res = await this.doFetch(path, options);

    // On 401, attempt a single token refresh then retry.
    // Exclude /auth/logout: if a logout returns 401, there's nothing to refresh.
    if (res.status === 401 && path !== "/auth/refresh" && path !== "/auth/logout") {
      if (!this.refreshing) {
        this.refreshing = this.refresh()
          .then((data) => {
            this.accessToken = data.access_token;
            this.onTokenRefreshed?.(data.access_token, data.user);
          })
          .catch(() => { this.accessToken = null; this.onAuthFailure?.(); })
          .finally(() => { this.refreshing = null; });
      }
      await this.refreshing;

      if (this.accessToken) {
        res = await this.doFetch(path, options);
      }
    }

    if (res.status === 204) {
      return undefined as T;
    }

    const body = await res.json();

    if (!res.ok) {
      const err = body?.error;
      throw new APIError(
        err?.code ?? "unknown",
        err?.message ?? "An unexpected error occurred",
        res.status
      );
    }

    return body.data as T;
  }

  // ─── Auth ─────────────────────────────────────────────────────────────────

  async register(data: {
    email: string;
    display_name: string;
    password: string;
    invite_code?: string;
    mek_salt: string;
    mek_envelope: string;
  }): Promise<AuthResponse> {
    return this.request("/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async login(data: {
    email: string;
    password: string;
    mfa_code?: string;
  }): Promise<AuthResponse> {
    return this.request("/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async resendVerification(email: string): Promise<void> {
    await this.request("/auth/resend-verification", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  }

  async forgotPassword(email: string): Promise<void> {
    await this.request("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  }

  async resetPassword(token: string, password: string): Promise<void> {
    await this.request("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, password }),
    });
  }

  async logout(): Promise<void> {
    await this.request("/auth/logout", { method: "POST" });
    this.accessToken = null;
  }

  async refresh(): Promise<{ access_token: string; user: User }> {
    return this.request("/auth/refresh", { method: "POST" });
  }

  async setupMFA(): Promise<{
    secret: string;
    otp_url: string;
    backup_codes: string[];
  }> {
    return this.request("/auth/mfa/setup", { method: "POST" });
  }

  async verifyMFA(data: {
    secret: string;
    code: string;
    backup_codes: string[];
  }): Promise<{ enabled: boolean }> {
    return this.request("/auth/mfa/verify", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async disableMFA(code: string): Promise<{ disabled: boolean }> {
    return this.request("/auth/mfa/disable", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
  }

  // ─── Passkeys ─────────────────────────────────────────────────────────────

  async passkeyBeginRegistration(): Promise<{
    challenge_id: string;
    creation_options: { publicKey: Record<string, unknown> };
  }> {
    return this.request("/users/me/passkeys/register/begin", { method: "POST" });
  }

  async passkeyFinishRegistration(
    challengeId: string,
    name: string,
    credential: Record<string, unknown>
  ): Promise<import("@/types").Passkey> {
    return this.request(
      `/users/me/passkeys/register/finish?challenge_id=${encodeURIComponent(challengeId)}&name=${encodeURIComponent(name)}`,
      { method: "POST", body: JSON.stringify(credential) }
    );
  }

  async passkeyBeginAuthentication(data: {
    email: string;
    password: string;
  }): Promise<{
    challenge_id: string;
    assertion_options: { publicKey: Record<string, unknown> };
  }> {
    return this.request("/auth/passkeys/authenticate/begin", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async passkeyFinishAuthentication(
    challengeId: string,
    assertion: Record<string, unknown>
  ): Promise<import("@/types").AuthResponse> {
    return this.request(
      `/auth/passkeys/authenticate/finish?challenge_id=${encodeURIComponent(challengeId)}`,
      { method: "POST", body: JSON.stringify(assertion) }
    );
  }

  async listPasskeys(): Promise<import("@/types").Passkey[]> {
    return this.request("/users/me/passkeys");
  }

  async renamePasskey(id: string, name: string): Promise<{ renamed: boolean }> {
    return this.request(`/users/me/passkeys/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    });
  }

  async deletePasskey(id: string): Promise<void> {
    await this.request(`/users/me/passkeys/${id}`, { method: "DELETE" });
  }

  // ─── Users ────────────────────────────────────────────────────────────────

  async getMe(): Promise<User> {
    return this.request("/users/me");
  }

  async updateMe(data: Partial<Pick<User, "display_name" | "timezone">>): Promise<User> {
    return this.request("/users/me", {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async changePassword(currentPassword: string, newPassword: string, newMEKEnvelope: string): Promise<void> {
    await this.request("/users/me/change-password", {
      method: "POST",
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
        new_mek_envelope: newMEKEnvelope,
      }),
    });
  }

  // ─── Recovery Key ─────────────────────────────────────────────────────────

  async setRecoveryKey(recoveryKeyEnvelope: string): Promise<void> {
    await this.request("/auth/recovery-key", {
      method: "POST",
      body: JSON.stringify({ recovery_key_envelope: recoveryKeyEnvelope }),
    });
  }

  async recoverStart(email: string): Promise<void> {
    await this.request("/auth/recover/start", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  }

  async recoverValidate(token: string): Promise<RecoverValidateResponse> {
    return this.request(`/auth/recover/validate?token=${encodeURIComponent(token)}`);
  }

  async recoverComplete(token: string, password: string, newMEKEnvelope: string): Promise<void> {
    await this.request("/auth/recover/complete", {
      method: "POST",
      body: JSON.stringify({ token, password, new_mek_envelope: newMEKEnvelope }),
    });
  }

  async getSessions(): Promise<Array<{
    id: string;
    device_info: string;
    ip_address: string;
    last_used_at: string;
  }>> {
    return this.request("/users/me/sessions");
  }

  async revokeSession(sessionID: string): Promise<void> {
    await this.request(`/users/me/sessions/${sessionID}`, { method: "DELETE" });
  }

  async revokeAllSessions(): Promise<void> {
    await this.request("/users/me/sessions", { method: "DELETE" });
  }

  // ─── Switch ───────────────────────────────────────────────────────────────

  async getSwitch(): Promise<SwitchSettings> {
    return this.request("/switch");
  }

  async updateSwitch(data: Partial<{
    check_in_interval_days: number;
    reminder1_days_before: number;
    reminder2_hours_before: number;
    final_warning_hours_before: number;
    abort_window_hours: number;
    death_report_response_hours: number;
    max_pause_days: number;
    is_active: boolean;
    preferred_checkin_hour: number;
    clear_preferred_hour: boolean;
    timezone: string;
  }>): Promise<SwitchSettings> {
    return this.request("/switch", {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async checkIn(): Promise<SwitchSettings> {
    return this.request("/switch/checkin", { method: "POST" });
  }

  async pauseSwitch(data: {
    resume_at?: string;
    reason?: string;
  }): Promise<SwitchSettings> {
    return this.request("/switch/pause", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async resumeSwitch(): Promise<SwitchSettings> {
    return this.request("/switch/resume", { method: "POST" });
  }

  async abortTrigger(): Promise<SwitchSettings> {
    return this.request("/switch/abort", { method: "POST" });
  }

  async abortByToken(token: string): Promise<{ status: string }> {
    return this.request("/switch/abort-token", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
  }

  async revokeDeliveries(): Promise<{ revoked: number }> {
    return this.request("/switch/revoke-deliveries", { method: "POST" });
  }

  async getCheckinHistory(): Promise<Array<{
    id: string;
    method: string;
    ip_address: string;
    created_at: string;
  }>> {
    return this.request("/switch/history");
  }

  async runSwitchTest(): Promise<{ status: string; note: string }> {
    return this.request("/switch/test", { method: "POST" });
  }

  // ─── Vaults ───────────────────────────────────────────────────────────────

  async listVaults(): Promise<Vault[]> {
    return this.request("/vaults");
  }

  async createVault(data: {
    name: string;
    description?: string;
    icon?: string;
    color?: string;
    cek_envelope: string;
    delivery_message_enc?: string;
  }): Promise<Vault> {
    return this.request("/vaults", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getVault(id: string): Promise<Vault> {
    return this.request(`/vaults/${id}`);
  }

  async updateVault(id: string, data: Partial<Vault>): Promise<Vault> {
    return this.request(`/vaults/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async deleteVault(id: string): Promise<void> {
    await this.request(`/vaults/${id}`, { method: "DELETE" });
  }

  async previewVault(id: string): Promise<{
    vault: Vault;
    preview_mode: boolean;
  }> {
    return this.request(`/vaults/${id}/preview`);
  }

  // ─── Entries ──────────────────────────────────────────────────────────────

  async listEntries(vaultID: string): Promise<VaultEntry[]> {
    return this.request(`/vaults/${vaultID}/entries`);
  }

  async createEntry(
    vaultID: string,
    data: {
      entry_type: string;
      title: string;
      encrypted_data: string;
    }
  ): Promise<VaultEntry> {
    return this.request(`/vaults/${vaultID}/entries`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateEntry(
    vaultID: string,
    entryID: string,
    data: Partial<{
      title: string;
      encrypted_data: string;
      is_favorite: boolean;
      sort_order: number;
    }>
  ): Promise<VaultEntry> {
    return this.request(`/vaults/${vaultID}/entries/${entryID}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async deleteEntry(vaultID: string, entryID: string): Promise<void> {
    await this.request(`/vaults/${vaultID}/entries/${entryID}`, {
      method: "DELETE",
    });
  }

  async bulkDeleteEntries(vaultID: string, ids: string[]): Promise<void> {
    await this.request(`/vaults/${vaultID}/entries/bulk`, {
      method: "DELETE",
      body: JSON.stringify({ ids }),
    });
  }

  async getEntryHistory(
    vaultID: string,
    entryID: string
  ): Promise<VaultEntryVersion[]> {
    return this.request(`/vaults/${vaultID}/entries/${entryID}/history`);
  }

  // ─── Beneficiaries ────────────────────────────────────────────────────────

  async listBeneficiaries(): Promise<Beneficiary[]> {
    return this.request("/beneficiaries");
  }

  async createBeneficiary(data: {
    name: string;
    email: string;
    phone?: string;
    relationship?: string;
    verification_method?: string;
    secret_question?: string;
    photo_data?: string;
  }): Promise<Beneficiary> {
    return this.request("/beneficiaries", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateBeneficiary(id: string, data: {
    name?: string;
    email?: string;
    relationship?: string;
    secret_question?: string;
    photo_data?: string;
  }): Promise<Beneficiary> {
    return this.request(`/beneficiaries/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async deleteBeneficiary(id: string): Promise<void> {
    await this.request(`/beneficiaries/${id}`, { method: "DELETE" });
  }

  async resendBeneficiaryConfirmation(id: string): Promise<void> {
    await this.request(`/beneficiaries/${id}/resend`, { method: "POST" });
  }

  async getBeneficiaryVaults(id: string): Promise<BeneficiaryVaultItem[]> {
    return this.request(`/beneficiaries/${id}/vaults`);
  }

  // ─── Vault Beneficiary Assignments ────────────────────────────────────────

  async getVaultBeneficiaries(vaultID: string): Promise<Array<{
    id: string;
    vault_id: string;
    beneficiary_id: string;
    additional_delay_days: number;
    created_at: string;
    beneficiary_name: string;
    beneficiary_email: string;
    email_confirmed: boolean;
    beneficiary_photo_data: string | null;
    tier: "primary" | "secondary" | "tertiary" | null;
    tier_unlocked_at: string | null;
  }>> {
    return this.request(`/vaults/${vaultID}/beneficiaries`);
  }

  async assignBeneficiaryToVault(vaultID: string, data: {
    beneficiary_id: string;
    beneficiary_cek_envelope: string;
  }): Promise<void> {
    await this.request(`/vaults/${vaultID}/beneficiaries`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async removeVaultBeneficiary(vaultID: string, beneficiaryID: string): Promise<void> {
    await this.request(`/vaults/${vaultID}/beneficiaries/${beneficiaryID}`, {
      method: "DELETE",
    });
  }

  async setBeneficiaryTier(vaultID: string, beneficiaryID: string, data: {
    tier: "primary" | "secondary" | "tertiary" | null;
    cascade_window_days?: number | null;
  }): Promise<void> {
    await this.request(`/vaults/${vaultID}/beneficiaries/${beneficiaryID}/tier`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  // ─── Trusted Contacts ─────────────────────────────────────────────────────

  async listTrustedContacts(): Promise<TrustedContact[]> {
    return this.request("/trusted-contacts");
  }

  async createTrustedContact(data: {
    name: string;
    email: string;
    phone?: string;
    photo_data?: string;
    notify_on_final_warning?: boolean;
    can_abort?: boolean;
    can_verify_life?: boolean;
    can_corroborate_death?: boolean;
  }): Promise<TrustedContact> {
    return this.request("/trusted-contacts", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateTrustedContact(id: string, data: {
    name: string;
    email: string;
    phone?: string;
    photo_data?: string;
    notify_on_final_warning: boolean;
    can_abort: boolean;
    can_verify_life: boolean;
    can_corroborate_death: boolean;
  }): Promise<TrustedContact> {
    return this.request(`/trusted-contacts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async deleteTrustedContact(id: string): Promise<void> {
    return this.request(`/trusted-contacts/${id}`, { method: "DELETE" });
  }

  // ─── Portal ───────────────────────────────────────────────────────────────

  async portalVerify(data: {
    token: string;
    secret_answer?: string;
    otp_code?: string;
  }): Promise<{ verified: boolean; access_token: string }> {
    return this.request("/portal/verify", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async portalGetVault(token: string): Promise<{
    vault: Vault;
    beneficiary_cek_envelope: string;
    expires_at: string;
  }> {
    return this.request(`/portal/vault?token=${encodeURIComponent(token)}`);
  }

  async portalGetEntries(token: string): Promise<VaultEntry[]> {
    return this.request(`/portal/entries?token=${encodeURIComponent(token)}`);
  }

  // ─── Files ────────────────────────────────────────────────────────────────

  async uploadFile(
    vaultID: string,
    encryptedBlob: Blob,
    onProgress?: (pct: number) => void
  ): Promise<VaultFile> {
    const form = new FormData();
    form.append("vault_id", vaultID);
    form.append("file", encryptedBlob, "encrypted");

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${BASE_URL}/files`);
      if (this.accessToken) {
        xhr.setRequestHeader("Authorization", `Bearer ${this.accessToken}`);
      }
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status === 201) {
          try {
            const body = JSON.parse(xhr.responseText);
            resolve(body.data ?? body);
          } catch { reject(new Error("Invalid response")); }
        } else {
          try {
            const err = JSON.parse(xhr.responseText);
            reject(new APIError(err.error?.code ?? "upload_failed", err.error?.message ?? "Upload failed", xhr.status));
          } catch { reject(new APIError("upload_failed", "Upload failed", xhr.status)); }
        }
      };
      xhr.onerror = () => reject(new APIError("network_error", "Network error — check your connection", 0));
      xhr.send(form);
    });
  }

  async downloadFile(storageToken: string): Promise<ArrayBuffer> {
    const res = await this.doFetch(`/files/${encodeURIComponent(storageToken)}`, {});
    if (!res.ok) throw new APIError("download_failed", "Download failed", res.status);
    return res.arrayBuffer();
  }

  async deleteFile(storageToken: string): Promise<void> {
    await this.request(`/files/${encodeURIComponent(storageToken)}`, { method: "DELETE" });
  }

  async portalDownloadFile(storageToken: string, accessToken: string): Promise<ArrayBuffer> {
    const url = `${BASE_URL}/portal/files/${encodeURIComponent(storageToken)}?token=${encodeURIComponent(accessToken)}`;
    const res = await fetch(url);
    if (!res.ok) throw new APIError("download_failed", "Download failed", res.status);
    return res.arrayBuffer();
  }

  // ─── Admin ────────────────────────────────────────────────────────────────

  async getAdminDashboard() {
    return this.request("/admin/dashboard");
  }

  async listAdminUsers(limit = 50, offset = 0) {
    return this.request(`/admin/users?limit=${limit}&offset=${offset}`);
  }

  async disableUser(userID: string) {
    return this.request(`/admin/users/${userID}/disable`, { method: "POST" });
  }

  async enableUser(userID: string) {
    return this.request(`/admin/users/${userID}/enable`, { method: "POST" });
  }

  async forceLogoutUser(userID: string) {
    return this.request(`/admin/users/${userID}/logout`, { method: "POST" });
  }

  async deleteAdminUser(userID: string) {
    return this.request(`/admin/users/${userID}`, { method: "DELETE" });
  }

  async getAdminAuditLog(params: { user_id?: string; event_type?: string; limit?: number; offset?: number } = {}) {
    const q = new URLSearchParams();
    if (params.user_id) q.set("user_id", params.user_id);
    if (params.event_type) q.set("event_type", params.event_type);
    if (params.limit) q.set("limit", String(params.limit));
    if (params.offset) q.set("offset", String(params.offset));
    return this.request(`/admin/audit-log?${q}`);
  }

  async getEmailQueue(status?: string, limit = 50, offset = 0) {
    const q = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (status) q.set("status", status);
    return this.request(`/admin/email-queue?${q}`);
  }

  async retryEmail(emailID: string) {
    return this.request(`/admin/email-queue/${emailID}/retry`, { method: "POST" });
  }

  async listInvites() {
    return this.request("/admin/invites");
  }

  async createInvite() {
    return this.request("/admin/invites", { method: "POST" });
  }

  async getAdminConfig(): Promise<Record<string, string>> {
    return this.request("/admin/config");
  }

  async updateAdminConfig(data: Record<string, string>): Promise<Record<string, string>> {
    return this.request("/admin/config", {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async changeEmail(newEmail: string, currentPassword: string) {
    return this.request("/users/me/change-email", {
      method: "POST",
      body: JSON.stringify({ new_email: newEmail, current_password: currentPassword }),
    });
  }

  async confirmEmailChange(token: string) {
    return this.request(`/auth/confirm-email-change?token=${encodeURIComponent(token)}`);
  }

  async deleteInvite(id: string) {
    return this.request(`/admin/invites/${id}`, { method: "DELETE" });
  }

  async sendInviteEmail(id: string, email: string) {
    return this.request(`/admin/invites/${id}/send`, {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  }

  async setUserRole(userId: string, role: string) {
    return this.request(`/admin/users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    });
  }

  async exportAuditLog(params: { user_id?: string; event_type?: string } = {}): Promise<Blob> {
    const qs = new URLSearchParams();
    if (params.user_id) qs.set("user_id", params.user_id);
    if (params.event_type) qs.set("event_type", params.event_type);
    const res = await this.doFetch(`/admin/audit-log/export?${qs}`, {});
    if (!res.ok) throw new APIError("export_failed", "Export failed", res.status);
    return res.blob();
  }

  async testSMTP(email: string) {
    return this.request("/admin/config/test-smtp", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  }

  async testStorage() {
    return this.request("/admin/config/test-storage", { method: "POST" });
  }

  async getBranding(): Promise<{ app_name: string; accent_color: string; login_counts_as_checkin: string; registration_mode: string }> {
    return this.request("/branding");
  }

  // ─── Death Report ─────────────────────────────────────────────────────────

  async initiateDeathReport(email: string): Promise<{ message: string }> {
    return this.request("/report/initiate", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  }

  async validateDeathReportToken(token: string): Promise<{ owner_name: string }> {
    return this.request(`/report/token?token=${encodeURIComponent(token)}`);
  }

  async submitDeathReport(data: {
    token: string;
    date_of_passing?: string;
    notes?: string;
  }): Promise<{ status: string }> {
    return this.request("/report/submit", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async verifyLife(token: string): Promise<{ status: string }> {
    return this.request("/report/verify-life", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
  }

  async trustedVerifyLife(token: string): Promise<{ status: string }> {
    return this.request("/report/trusted-verify", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
  }

  async trustedCorroborate(token: string): Promise<{ status: string }> {
    return this.request("/report/trusted-corroborate", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
  }

  async getActiveDeathReport(): Promise<{
    id: string;
    reporter_email: string;
    reporter_name: string;
    status: string;
    response_deadline: string;
    created_at: string;
  } | null> {
    return this.request("/report/active");
  }

  async submitAccessRequest(name: string, email: string, message: string): Promise<{ status: string }> {
    return this.request("/access-request", {
      method: "POST",
      body: JSON.stringify({ name, email, message }),
    });
  }

  // ─── Beneficiary Access Portal ────────────────────────────────────────────

  async initiateBeneficiaryAccess(email: string): Promise<{ status: string }> {
    return this.request("/access/initiate", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  }

  async getBeneficiaryPortal(token: string): Promise<{
    beneficiary_name: string;
    email: string;
    owners: {
      owner_display_name: string;
      vault_count: number;
      email_confirmed: boolean;
      beneficiary_id: string;
    }[];
  }> {
    return this.request(`/access/portal?token=${encodeURIComponent(token)}`);
  }

  // ─── Vault Export ─────────────────────────────────────────────────────────

  async exportVault(vaultID: string): Promise<Blob> {
    const res = await this.doFetch(`/vaults/${vaultID}/export`, { method: "POST" });
    if (!res.ok) throw new APIError("export_failed", "Export failed", res.status);
    return res.blob();
  }

  async exportAccount(): Promise<{ blob: Blob; filename: string }> {
    const res = await this.doFetch("/users/me/export", { method: "POST" });
    if (!res.ok) throw new APIError("export_failed", "Export failed", res.status);
    const disposition = res.headers.get("Content-Disposition") ?? "";
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match ? match[1] : `psvault-export-${new Date().toISOString().slice(0, 10)}.zip`;
    return { blob: await res.blob(), filename };
  }
}

export class APIError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number
  ) {
    super(message);
    this.name = "APIError";
  }
}

export const api = new APIClient();
