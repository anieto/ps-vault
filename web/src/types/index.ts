export interface User {
  id: string;
  email: string;
  display_name: string;
  role: "user" | "admin";
  email_verified: boolean;
  mfa_enabled: boolean;
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
  access_mode: "simultaneous" | "cascading";
  cascade_window_days: number;
  notify_locked_tiers: boolean;
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

export interface BeneficiaryVaultItem {
  id: string;
  name: string;
  icon: string;
  tier?: string | null;
}

export interface Beneficiary {
  id: string;
  user_id: string;
  name: string;
  email: string;
  phone: string | null;
  relationship: string | null;
  secret_question: string | null;
  photo_data: string | null;
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
  can_verify_life: boolean;
  can_corroborate_death: boolean;
  created_at: string;
}

// Decrypted entry data shapes (client-side only, never sent to server)
export interface LoginEntry {
  service_name: string;
  url?: string;
  username: string;
  password: string;
  totp_secret?: string;
  backup_codes?: string;
  notes?: string;
}

export interface NoteEntry {
  body: string;
  tags?: string[];
}

export interface APIResponse<T> {
  data: T;
  error: null;
}

export interface APIError {
  data: null;
  error: {
    code: string;
    message: string;
  };
}

// Crypto types
export interface Argon2Params {
  memory: number;      // kibibytes
  iterations: number;
  parallelism: number;
  key_length: number;
}

export interface EncryptedPayload {
  ciphertext: string; // base64url
  nonce: string;      // base64url
}

// Auth response includes crypto fields needed to derive the MEK client-side
export interface AuthResponse {
  access_token: string;
  user: User;
  mek_salt: string;      // hex — random Argon2id salt for KEK derivation
  mek_envelope: string;  // base64url — MEK wrapped with KEK (XChaCha20-Poly1305)
  argon2_params: string; // JSON — Argon2id params to use for KEK derivation
}

export interface RecoverValidateResponse {
  mek_salt: string;
  argon2_params: string;
  recovery_key_envelope: string;
}
