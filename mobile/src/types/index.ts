// Shared types — mirrored from web/src/types/index.ts
// Keep in sync when backend types change.

export interface User {
  id: string;
  email: string;
  display_name: string;
  role: "user" | "admin";
  email_verified: boolean;
  mfa_enabled: boolean;
  mfa_methods: string[]; // extensible for passkeys (Phase 6)
  has_recovery_key: boolean;
  timezone: string;
  created_at: string;
}

export interface VaultFile {
  id: string;
  user_id: string;
  vault_id: string;
  storage_token: string;
  size_bytes: number;
  created_at: string;
}

export interface SwitchSettings {
  id: string;
  user_id: string;
  is_active: boolean;
  check_in_interval_days: number;
  reminder1_days_before: number;
  reminder2_hours_before: number;
  final_warning_hours_before: number;
  abort_window_hours: number;
  death_report_response_hours: number;
  max_pause_days: number;
  preferred_checkin_hour: number | null;
  status: "inactive" | "active" | "paused" | "triggered" | "delivered";
  last_checkin_at: string | null;
  next_checkin_deadline: string | null;
  paused_until: string | null;
  triggered_at: string | null;
  abort_deadline: string | null;
  created_at: string;
  updated_at: string;
}

export interface Vault {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  status: "active" | "draft" | "archived";
  delivery_message_enc: string | null;
  cek_envelope: string;
  check_in_interval_override: number | null;
  abort_window_override: number | null;
  switch_enabled: boolean;
  additional_delivery_delay_days: number;
  post_delivery_retention: "keep" | "delete_on_expiry" | "delete_after_days";
  post_delivery_retention_days: number | null;
  created_at: string;
  updated_at: string;
}

export type EntryType =
  | "login"
  | "note"
  | "file"
  | "contact"
  | "financial"
  | "card"
  | "identity"
  | "crypto"
  | "custom";

export interface VaultEntry {
  id: string;
  vault_id: string;
  entry_type: EntryType;
  title: string;
  encrypted_data: string;
  is_favorite: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface VaultEntryVersion {
  id: string;
  entry_id: string;
  encrypted_data: string;
  created_at: string;
}

export interface Beneficiary {
  id: string;
  user_id: string;
  name: string;
  email: string;
  phone: string | null;
  relationship: string | null;
  email_confirmed: boolean;
  verification_method: "secret" | "otp" | "both";
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TrustedContact {
  id: string;
  user_id: string;
  name: string;
  email: string;
  phone: string | null;
  notify_on_final_warning: boolean;
  can_abort: boolean;
  created_at: string;
}

// ─── Crypto types ─────────────────────────────────────────────────────────────

export interface Argon2Params {
  memory: number;
  iterations: number;
  parallelism: number;
  key_length: number;
}

// ─── Auth response ─────────────────────────────────────────────────────────────

export interface AuthResponse {
  access_token: string;
  refresh_token: string; // included in mobile responses (X-Client: mobile)
  user: User;
  mek_salt: string;
  mek_envelope: string;
  argon2_params: string;
}

export interface RecoverValidateResponse {
  mek_salt: string;
  argon2_params: string;
  recovery_key_envelope: string;
}

// ─── Push notification payload ─────────────────────────────────────────────────

export type PushNotificationType =
  | "checkin_reminder"
  | "checkin_warning"
  | "checkin_final"
  | "trigger_abort"
  // Phase 6 types (handled gracefully now, fully implemented later):
  | "trusted_contact_alert"
  | "death_report_submitted"
  | "test_mode";

export interface PushNotificationData {
  type: PushNotificationType;
  deep_link?: string;
}
