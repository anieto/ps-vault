/**
 * P.S. Vault mobile API client
 *
 * Differences from web:
 *   - BASE_URL is dynamic (user-configured server URL from secure storage)
 *   - Refresh token sent in request body, not via httpOnly cookie
 *   - X-Client: mobile header on all requests
 *   - No XHR — file upload uses fetch + FormData
 *   - Stubs for Phase 6 endpoints (trusted contacts, test mode, etc.)
 */

import type {
  User,
  SwitchSettings,
  Vault,
  VaultEntry,
  VaultEntryVersion,
  VaultFile,
  Beneficiary,
  TrustedContact,
  AuthResponse,
  RecoverValidateResponse,
} from '@/types';

class APIClient {
  private baseUrl: string = '';
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private refreshing: Promise<void> | null = null;
  private onTokenRefreshed: ((token: string, user: User) => void) | null = null;
  private onAuthExpired: (() => void) | null = null;

  setBaseUrl(url: string): void {
    this.baseUrl = `${url}/api/v1`;
  }

  setTokens(accessToken: string | null, refreshToken: string | null): void {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
  }

  setOnTokenRefreshed(cb: (token: string, user: User) => void): void {
    this.onTokenRefreshed = cb;
  }

  setOnAuthExpired(cb: () => void): void {
    this.onAuthExpired = cb;
  }

  private get headers(): Record<string, string> {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Client': 'mobile',
    };
    if (this.accessToken) h['Authorization'] = `Bearer ${this.accessToken}`;
    return h;
  }

  private async doFetch(path: string, options: RequestInit): Promise<Response> {
    if (!this.baseUrl) throw new APIError('no_server', 'No server URL configured', 0);
    return fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: { ...this.headers, ...(options.headers as Record<string, string>) },
    });
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    let res = await this.doFetch(path, options);

    if (res.status === 401 && path !== '/auth/refresh') {
      if (!this.refreshing) {
        this.refreshing = this.refresh()
          .then((data) => {
            this.accessToken = data.access_token;
            this.onTokenRefreshed?.(data.access_token, data.user);
          })
          .catch(() => {
            this.accessToken = null;
            this.onAuthExpired?.();
          })
          .finally(() => { this.refreshing = null; });
      }
      await this.refreshing;

      if (this.accessToken) {
        res = await this.doFetch(path, options);
      }
    }

    if (res.status === 204) return undefined as T;

    const body = await res.json();
    if (!res.ok) {
      const err = body?.error;
      throw new APIError(
        err?.code ?? 'unknown',
        err?.message ?? 'An unexpected error occurred',
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
    return this.request('/auth/register', { method: 'POST', body: JSON.stringify(data) });
  }

  async login(data: {
    email: string;
    password: string;
    mfa_code?: string;
  }): Promise<AuthResponse> {
    return this.request('/auth/login', { method: 'POST', body: JSON.stringify(data) });
  }

  async refresh(): Promise<{ access_token: string; refresh_token: string; user: User }> {
    // Mobile sends refresh token in body, not via cookie
    return this.request('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: this.refreshToken }),
    });
  }

  async logout(): Promise<void> {
    await this.request('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: this.refreshToken }),
    });
    this.accessToken = null;
    this.refreshToken = null;
  }

  async resendVerification(email: string): Promise<void> {
    await this.request('/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  async forgotPassword(email: string): Promise<void> {
    await this.request('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  async resetPassword(token: string, password: string): Promise<void> {
    await this.request('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    });
  }

  async setupMFA(): Promise<{ secret: string; otp_url: string; backup_codes: string[] }> {
    return this.request('/auth/mfa/setup', { method: 'POST' });
  }

  async verifyMFA(data: {
    secret: string;
    code: string;
    backup_codes: string[];
  }): Promise<{ enabled: boolean }> {
    return this.request('/auth/mfa/verify', { method: 'POST', body: JSON.stringify(data) });
  }

  async disableMFA(code: string): Promise<{ disabled: boolean }> {
    return this.request('/auth/mfa/disable', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  }

  async setRecoveryKey(recoveryKeyEnvelope: string): Promise<void> {
    await this.request('/auth/recovery-key', {
      method: 'POST',
      body: JSON.stringify({ recovery_key_envelope: recoveryKeyEnvelope }),
    });
  }

  async recoverStart(email: string): Promise<void> {
    await this.request('/auth/recover/start', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  async recoverValidate(token: string): Promise<RecoverValidateResponse> {
    return this.request(`/auth/recover/validate?token=${encodeURIComponent(token)}`);
  }

  async recoverComplete(
    token: string,
    password: string,
    newMEKEnvelope: string
  ): Promise<void> {
    await this.request('/auth/recover/complete', {
      method: 'POST',
      body: JSON.stringify({ token, password, new_mek_envelope: newMEKEnvelope }),
    });
  }

  // ─── Push tokens ──────────────────────────────────────────────────────────

  async registerPushToken(token: string, platform: 'ios' | 'android'): Promise<void> {
    await this.request('/users/me/push-token', {
      method: 'POST',
      body: JSON.stringify({ token, platform }),
    });
  }

  async deletePushToken(): Promise<void> {
    await this.request('/users/me/push-token', { method: 'DELETE' });
  }

  // ─── Users ────────────────────────────────────────────────────────────────

  async getMe(): Promise<User> {
    return this.request('/users/me');
  }

  async updateMe(data: Partial<Pick<User, 'display_name' | 'timezone'>>): Promise<User> {
    return this.request('/users/me', { method: 'PATCH', body: JSON.stringify(data) });
  }

  async changePassword(
    currentPassword: string,
    newPassword: string,
    newMEKEnvelope: string
  ): Promise<void> {
    await this.request('/users/me/change-password', {
      method: 'POST',
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
        new_mek_envelope: newMEKEnvelope,
      }),
    });
  }

  async changeEmail(newEmail: string, currentPassword: string): Promise<void> {
    await this.request('/users/me/change-email', {
      method: 'POST',
      body: JSON.stringify({ new_email: newEmail, current_password: currentPassword }),
    });
  }

  async getSessions(): Promise<
    Array<{ id: string; device_info: string; ip_address: string; last_used_at: string }>
  > {
    return this.request('/users/me/sessions');
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.request(`/users/me/sessions/${sessionId}`, { method: 'DELETE' });
  }

  async revokeAllSessions(): Promise<void> {
    await this.request('/users/me/sessions', { method: 'DELETE' });
  }

  // ─── Switch ───────────────────────────────────────────────────────────────

  async getSwitch(): Promise<SwitchSettings> {
    return this.request('/switch');
  }

  async updateSwitch(
    data: Partial<{
      check_in_interval_days: number;
      reminder1_days_before: number;
      reminder2_hours_before: number;
      final_warning_hours_before: number;
      abort_window_hours: number;
      is_active: boolean;
      preferred_checkin_hour: number;
      clear_preferred_hour: boolean;
    }>
  ): Promise<SwitchSettings> {
    return this.request('/switch', { method: 'PATCH', body: JSON.stringify(data) });
  }

  async checkIn(): Promise<SwitchSettings> {
    return this.request('/switch/checkin', { method: 'POST' });
  }

  async pauseSwitch(data: { resume_at?: string; reason?: string }): Promise<SwitchSettings> {
    return this.request('/switch/pause', { method: 'POST', body: JSON.stringify(data) });
  }

  async resumeSwitch(): Promise<SwitchSettings> {
    return this.request('/switch/resume', { method: 'POST' });
  }

  async abortTrigger(): Promise<SwitchSettings> {
    return this.request('/switch/abort', { method: 'POST' });
  }

  async revokeDeliveries(): Promise<{ revoked: number }> {
    return this.request('/switch/revoke-deliveries', { method: 'POST' });
  }

  async getCheckinHistory(): Promise<
    Array<{ id: string; method: string; ip_address: string; created_at: string }>
  > {
    return this.request('/switch/history');
  }

  // ─── Vaults ───────────────────────────────────────────────────────────────

  async listVaults(): Promise<Vault[]> {
    return this.request('/vaults');
  }

  async createVault(data: {
    name: string;
    description?: string;
    icon?: string;
    color?: string;
    cek_envelope: string;
    delivery_message_enc?: string;
  }): Promise<Vault> {
    return this.request('/vaults', { method: 'POST', body: JSON.stringify(data) });
  }

  async getVault(id: string): Promise<Vault> {
    return this.request(`/vaults/${id}`);
  }

  async updateVault(id: string, data: Partial<Vault>): Promise<Vault> {
    return this.request(`/vaults/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  }

  async deleteVault(id: string): Promise<void> {
    await this.request(`/vaults/${id}`, { method: 'DELETE' });
  }

  // ─── Entries ──────────────────────────────────────────────────────────────

  async listEntries(vaultId: string): Promise<VaultEntry[]> {
    return this.request(`/vaults/${vaultId}/entries`);
  }

  async createEntry(
    vaultId: string,
    data: { entry_type: string; title: string; encrypted_data: string }
  ): Promise<VaultEntry> {
    return this.request(`/vaults/${vaultId}/entries`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateEntry(
    vaultId: string,
    entryId: string,
    data: Partial<{
      title: string;
      encrypted_data: string;
      is_favorite: boolean;
      sort_order: number;
    }>
  ): Promise<VaultEntry> {
    return this.request(`/vaults/${vaultId}/entries/${entryId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteEntry(vaultId: string, entryId: string): Promise<void> {
    await this.request(`/vaults/${vaultId}/entries/${entryId}`, { method: 'DELETE' });
  }

  async getEntryHistory(vaultId: string, entryId: string): Promise<VaultEntryVersion[]> {
    return this.request(`/vaults/${vaultId}/entries/${entryId}/history`);
  }

  // ─── Beneficiaries ────────────────────────────────────────────────────────

  async listBeneficiaries(): Promise<Beneficiary[]> {
    return this.request('/beneficiaries');
  }

  async createBeneficiary(data: {
    name: string;
    email: string;
    phone?: string;
    relationship?: string;
    verification_method?: string;
    secret_question?: string;
  }): Promise<Beneficiary> {
    return this.request('/beneficiaries', { method: 'POST', body: JSON.stringify(data) });
  }

  async updateBeneficiary(id: string, data: Partial<Beneficiary>): Promise<Beneficiary> {
    return this.request(`/beneficiaries/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteBeneficiary(id: string): Promise<void> {
    await this.request(`/beneficiaries/${id}`, { method: 'DELETE' });
  }

  async resendBeneficiaryConfirmation(id: string): Promise<void> {
    await this.request(`/beneficiaries/${id}/resend`, { method: 'POST' });
  }

  async getVaultBeneficiaries(vaultId: string): Promise<
    Array<{
      id: string;
      vault_id: string;
      beneficiary_id: string;
      additional_delay_days: number;
      created_at: string;
      beneficiary_name: string;
      beneficiary_email: string;
      email_confirmed: boolean;
    }>
  > {
    return this.request(`/vaults/${vaultId}/beneficiaries`);
  }

  async assignBeneficiaryToVault(
    vaultId: string,
    data: { beneficiary_id: string; beneficiary_cek_envelope: string }
  ): Promise<void> {
    await this.request(`/vaults/${vaultId}/beneficiaries`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async removeVaultBeneficiary(vaultId: string, beneficiaryId: string): Promise<void> {
    await this.request(`/vaults/${vaultId}/beneficiaries/${beneficiaryId}`, {
      method: 'DELETE',
    });
  }

  // ─── Trusted contacts (Phase 6 stubs) ─────────────────────────────────────

  async listTrustedContacts(): Promise<TrustedContact[]> {
    return this.request('/trusted-contacts');
  }

  async createTrustedContact(data: {
    name: string;
    email: string;
    phone?: string;
    notify_on_final_warning?: boolean;
    can_abort?: boolean;
  }): Promise<TrustedContact> {
    return this.request('/trusted-contacts', { method: 'POST', body: JSON.stringify(data) });
  }

  async updateTrustedContact(id: string, data: Partial<TrustedContact>): Promise<TrustedContact> {
    return this.request(`/trusted-contacts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteTrustedContact(id: string): Promise<void> {
    await this.request(`/trusted-contacts/${id}`, { method: 'DELETE' });
  }

  // ─── Files ────────────────────────────────────────────────────────────────

  async uploadFile(
    vaultId: string,
    encryptedBlob: Blob,
    onProgress?: (pct: number) => void
  ): Promise<VaultFile> {
    // React Native fetch supports FormData; progress tracking requires XMLHttpRequest
    if (onProgress) {
      return this.uploadFileWithProgress(vaultId, encryptedBlob, onProgress);
    }
    const form = new FormData();
    form.append('vault_id', vaultId);
    form.append('file', encryptedBlob as unknown as Blob, 'encrypted');

    const res = await fetch(`${this.baseUrl}/files`, {
      method: 'POST',
      headers: { 'X-Client': 'mobile', Authorization: `Bearer ${this.accessToken}` },
      body: form,
    });
    if (!res.ok) throw new APIError('upload_failed', 'Upload failed', res.status);
    const body = await res.json();
    return body.data ?? body;
  }

  private uploadFileWithProgress(
    vaultId: string,
    encryptedBlob: Blob,
    onProgress: (pct: number) => void
  ): Promise<VaultFile> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${this.baseUrl}/files`);
      xhr.setRequestHeader('X-Client', 'mobile');
      if (this.accessToken) xhr.setRequestHeader('Authorization', `Bearer ${this.accessToken}`);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status === 201) {
          try {
            const body = JSON.parse(xhr.responseText);
            resolve(body.data ?? body);
          } catch { reject(new APIError('upload_failed', 'Invalid response', xhr.status)); }
        } else {
          reject(new APIError('upload_failed', 'Upload failed', xhr.status));
        }
      };
      xhr.onerror = () => reject(new APIError('network_error', 'Network error', 0));

      const form = new FormData();
      form.append('vault_id', vaultId);
      form.append('file', encryptedBlob as unknown as Blob, 'encrypted');
      xhr.send(form);
    });
  }

  async downloadFile(storageToken: string): Promise<ArrayBuffer> {
    const res = await this.doFetch(`/files/${encodeURIComponent(storageToken)}`, {});
    if (!res.ok) throw new APIError('download_failed', 'Download failed', res.status);
    return res.arrayBuffer();
  }

  async deleteFile(storageToken: string): Promise<void> {
    await this.request(`/files/${encodeURIComponent(storageToken)}`, { method: 'DELETE' });
  }

  // ─── Branding ─────────────────────────────────────────────────────────────

  async getBranding(): Promise<{ app_name: string; accent_color: string }> {
    return this.request('/branding');
  }

  // ─── Switch test mode (Phase 6 stub) ──────────────────────────────────────

  async startTestMode(): Promise<void> {
    // Phase 6: POST /switch/test/start
    throw new Error('Not implemented — Phase 6');
  }

  async cancelTestMode(): Promise<void> {
    // Phase 6: POST /switch/test/cancel
    throw new Error('Not implemented — Phase 6');
  }

  // ─── User data export (Phase 6 stub) ──────────────────────────────────────

  async requestDataExport(): Promise<void> {
    // Phase 6: POST /users/me/export
    throw new Error('Not implemented — Phase 6');
  }
}

export class APIError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number
  ) {
    super(message);
    this.name = 'APIError';
  }
}

export const api = new APIClient();
