package models

import (
	"database/sql"
	"encoding/json"
	"time"
)

// NullTime marshals as an RFC3339 string or JSON null.
type NullTime struct{ sql.NullTime }

func (t NullTime) MarshalJSON() ([]byte, error) {
	if !t.Valid {
		return []byte("null"), nil
	}
	return json.Marshal(t.Time.UTC().Format(time.RFC3339))
}

// NullString marshals as a JSON string or null.
type NullString struct{ sql.NullString }

func (s NullString) MarshalJSON() ([]byte, error) {
	if !s.Valid {
		return []byte("null"), nil
	}
	return json.Marshal(s.String)
}

// NullInt32 marshals as a JSON number or null.
type NullInt32 struct{ sql.NullInt32 }

func (n NullInt32) MarshalJSON() ([]byte, error) {
	if !n.Valid {
		return []byte("null"), nil
	}
	return json.Marshal(n.Int32)
}

// User represents a registered account.
type User struct {
	ID                  string     `db:"id"                    json:"id"`
	Email               string     `db:"email"                 json:"email"`
	DisplayName         string     `db:"display_name"          json:"display_name"`
	PasswordHash        string     `db:"password_hash"         json:"-"`
	KeyVerificationHash string     `db:"key_verification_hash" json:"-"`
	Argon2Params        string     `db:"argon2_params"         json:"-"` // JSON — params for client-side Argon2id KEK derivation
	MEKSalt             string     `db:"mek_salt"              json:"-"` // hex — random salt for Argon2id KEK derivation
	MEKEnvelope         string     `db:"mek_envelope"          json:"-"` // base64url — MEK wrapped with KEK (XChaCha20-Poly1305)
	RecoveryKeyEnvelope NullString `db:"recovery_key_envelope" json:"-"` // base64url — MEK wrapped with recovery key
	EmailVerified       bool       `db:"email_verified"        json:"email_verified"`
	EmailVerifyToken    NullString `db:"email_verify_token"    json:"-"`
	EmailVerifyExpires  NullTime   `db:"email_verify_expires"  json:"-"`
	PendingEmail        NullString `db:"pending_email"         json:"-"`
	EmailChangeToken    NullString `db:"email_change_token"    json:"-"`
	EmailChangeExpires  NullTime   `db:"email_change_expires"  json:"-"`
	MFAEnabled          bool       `db:"mfa_enabled"           json:"mfa_enabled"`
	MFASecret           NullString `db:"mfa_secret"            json:"-"`
	MFABackupCodes      NullString `db:"mfa_backup_codes"      json:"-"`
	Role                string     `db:"role"                  json:"role"`
	IsActive            bool       `db:"is_active"             json:"is_active"`
	Timezone            string     `db:"timezone"              json:"timezone"`
	FailedLoginAttempts int        `db:"failed_login_attempts" json:"-"`
	LockedUntil         NullTime   `db:"locked_until"          json:"-"`
	LastLoginAt         NullTime   `db:"last_login_at"         json:"last_login_at,omitempty"`
	CreatedAt           time.Time  `db:"created_at"            json:"created_at"`
	UpdatedAt           time.Time  `db:"updated_at"            json:"updated_at"`
}

// Session represents an active refresh token session.
type Session struct {
	ID                string     `db:"id"                  json:"id"`
	UserID            string     `db:"user_id"             json:"user_id"`
	RefreshTokenHash  string     `db:"refresh_token_hash"  json:"-"`
	DeviceInfo        string     `db:"device_info"         json:"device_info"`
	IPAddress         string     `db:"ip_address"          json:"ip_address"`
	ExpiresAt         time.Time  `db:"expires_at"          json:"expires_at"`
	CreatedAt         time.Time  `db:"created_at"          json:"created_at"`
	LastUsedAt        time.Time  `db:"last_used_at"        json:"last_used_at"`
	ClientType        string     `db:"client_type"         json:"client_type"`
	ExpiryNotifiedAt  *time.Time `db:"expiry_notified_at"  json:"-"`
}

// SwitchSettings represents the Emergency Release Switch configuration for a user.
type SwitchSettings struct {
	ID                       string         `db:"id"                          json:"id"`
	UserID                   string         `db:"user_id"                     json:"user_id"`
	IsActive                 bool           `db:"is_active"                   json:"is_active"`
	CheckInIntervalDays      int            `db:"check_in_interval_days"      json:"check_in_interval_days"`
	Reminder1HoursBefore     NullInt32      `db:"reminder1_hours_before"      json:"reminder1_hours_before,omitempty"`
	Reminder2HoursBefore     NullInt32      `db:"reminder2_hours_before"      json:"reminder2_hours_before,omitempty"`
	Reminder3HoursBefore     NullInt32      `db:"reminder3_hours_before"      json:"reminder3_hours_before,omitempty"`
	AbortWindowHours         int            `db:"abort_window_hours"          json:"abort_window_hours"`
	DeathReportResponseHours int            `db:"death_report_response_hours" json:"death_report_response_hours"`
	MaxPauseDays             int            `db:"max_pause_days"              json:"max_pause_days"`
	PreferredCheckinHour     NullInt32      `db:"preferred_checkin_hour"      json:"preferred_checkin_hour,omitempty"`
	Status                   string         `db:"status"                      json:"status"`
	LastCheckinAt            NullTime   `db:"last_checkin_at"             json:"last_checkin_at,omitempty"`
	NextCheckinDeadline      NullTime   `db:"next_checkin_deadline"       json:"next_checkin_deadline,omitempty"`
	PausedUntil              NullTime   `db:"paused_until"                json:"paused_until,omitempty"`
	TriggeredAt              NullTime   `db:"triggered_at"                json:"triggered_at,omitempty"`
	AbortDeadline            NullTime   `db:"abort_deadline"              json:"abort_deadline,omitempty"`
	Reminder1SentAt          NullTime   `db:"reminder1_sent_at"              json:"reminder1_sent_at,omitempty"`
	Reminder2SentAt          NullTime   `db:"reminder2_sent_at"              json:"reminder2_sent_at,omitempty"`
	Reminder3SentAt          NullTime   `db:"reminder3_sent_at"              json:"reminder3_sent_at,omitempty"`
	EmailCheckinToken        NullString `db:"email_checkin_token"            json:"-"`
	EmailCheckinTokenExpires NullTime   `db:"email_checkin_token_expires"    json:"-"`
	CreatedAt                time.Time  `db:"created_at"                     json:"created_at"`
	UpdatedAt                time.Time  `db:"updated_at"                     json:"updated_at"`
}

// SwitchCheckin represents a single check-in event.
type SwitchCheckin struct {
	ID        string    `db:"id"         json:"id"`
	UserID    string    `db:"user_id"    json:"user_id"`
	Method    string    `db:"method"     json:"method"`
	IPAddress string    `db:"ip_address" json:"ip_address"`
	CreatedAt time.Time `db:"created_at" json:"created_at"`
}

// Vault represents an encrypted vault container.
type Vault struct {
	ID                          string         `db:"id"                            json:"id"`
	UserID                      string         `db:"user_id"                       json:"user_id"`
	Name                        string         `db:"name"                          json:"name"`
	Description                 NullString `db:"description"                   json:"description,omitempty"`
	Icon                        string         `db:"icon"                          json:"icon"`
	Color                       string         `db:"color"                         json:"color"`
	Status                      string         `db:"status"                        json:"status"`
	DeliveryMessageEnc          NullString `db:"delivery_message_enc"          json:"delivery_message_enc,omitempty"`
	CEKEnvelope                 string         `db:"cek_envelope"                  json:"cek_envelope"`
	CheckInIntervalOverride     NullInt32  `db:"check_in_interval_override"    json:"check_in_interval_override,omitempty"`
	AbortWindowOverride         NullInt32  `db:"abort_window_override"         json:"abort_window_override,omitempty"`
	SwitchEnabled               bool           `db:"switch_enabled"                json:"switch_enabled"`
	AdditionalDeliveryDelayDays int            `db:"additional_delivery_delay_days" json:"additional_delivery_delay_days"`
	PostDeliveryRetention       string         `db:"post_delivery_retention"       json:"post_delivery_retention"`
	PostDeliveryRetentionDays   NullInt32  `db:"post_delivery_retention_days"  json:"post_delivery_retention_days,omitempty"`
	AccessMode                  string         `db:"access_mode"                   json:"access_mode"`
	CascadeWindowDays           int            `db:"cascade_window_days"           json:"cascade_window_days"`
	NotifyLockedTiers           bool           `db:"notify_locked_tiers"           json:"notify_locked_tiers"`
	CreatedAt                   time.Time      `db:"created_at"                    json:"created_at"`
	UpdatedAt                   time.Time      `db:"updated_at"                    json:"updated_at"`
}

// VaultEntry represents a single encrypted entry within a vault.
type VaultEntry struct {
	ID            string    `db:"id"             json:"id"`
	VaultID       string    `db:"vault_id"       json:"vault_id"`
	EntryType     string    `db:"entry_type"     json:"entry_type"`
	Title         string    `db:"title"          json:"title"`
	EncryptedData string    `db:"encrypted_data" json:"encrypted_data"`
	IsFavorite    bool      `db:"is_favorite"    json:"is_favorite"`
	SortOrder     int       `db:"sort_order"     json:"sort_order"`
	CreatedAt     time.Time `db:"created_at"     json:"created_at"`
	UpdatedAt     time.Time `db:"updated_at"     json:"updated_at"`
}

// VaultEntryVersion represents a historical version of an entry.
type VaultEntryVersion struct {
	ID            string    `db:"id"             json:"id"`
	EntryID       string    `db:"entry_id"       json:"entry_id"`
	EncryptedData string    `db:"encrypted_data" json:"encrypted_data"`
	CreatedAt     time.Time `db:"created_at"     json:"created_at"`
}

// Beneficiary represents a person who will receive vault access on trigger.
type Beneficiary struct {
	ID                  string         `db:"id"                   json:"id"`
	UserID              string         `db:"user_id"              json:"user_id"`
	Name                string         `db:"name"                 json:"name"`
	Email               string         `db:"email"                json:"email"`
	Phone               NullString `db:"phone"                json:"phone,omitempty"`
	Relationship        NullString `db:"relationship"         json:"relationship,omitempty"`
	NotesEnc            NullString `db:"notes_enc"            json:"-"`
	EmailConfirmed      bool           `db:"email_confirmed"      json:"email_confirmed"`
	EmailConfirmToken   NullString `db:"email_confirm_token"  json:"-"`
	EmailConfirmExpires NullTime   `db:"email_confirm_expires" json:"-"`
	VerificationMethod  string         `db:"verification_method"  json:"verification_method"`
	SecretQuestionEnc   NullString `db:"secret_question_enc"  json:"secret_question,omitempty"`
	SecretAnswerHash    NullString `db:"secret_answer_hash"   json:"-"`
	PhotoData           NullString `db:"photo_data"           json:"photo_data,omitempty"`
	PhoneVerified       bool           `db:"phone_verified"       json:"phone_verified"`
	IsActive            bool           `db:"is_active"            json:"is_active"`
	CreatedAt           time.Time      `db:"created_at"           json:"created_at"`
	UpdatedAt           time.Time      `db:"updated_at"           json:"updated_at"`
}

// VaultBeneficiary represents the assignment of a beneficiary to a vault.
type VaultBeneficiary struct {
	ID                     string     `db:"id"                           json:"id"`
	VaultID                string     `db:"vault_id"                     json:"vault_id"`
	BeneficiaryID          string     `db:"beneficiary_id"               json:"beneficiary_id"`
	BeneficiaryCEKEnvelope string     `db:"beneficiary_cek_envelope"     json:"beneficiary_cek_envelope"`
	AdditionalDelayDays    int        `db:"additional_delay_days"        json:"additional_delay_days"`
	Tier                   NullString `db:"tier"                         json:"tier,omitempty"`
	TierUnlockedAt         NullTime   `db:"tier_unlocked_at"             json:"tier_unlocked_at,omitempty"`
	TierCascadeWindowDays  NullInt32  `db:"tier_cascade_window_days"     json:"tier_cascade_window_days,omitempty"`
	CreatedAt              time.Time  `db:"created_at"                   json:"created_at"`
}

// TrustedContact represents someone notified on trigger but without vault access.
type TrustedContact struct {
	ID                    string     `db:"id"                      json:"id"`
	UserID                string     `db:"user_id"                 json:"user_id"`
	Name                  string     `db:"name"                    json:"name"`
	Email                 string     `db:"email"                   json:"email"`
	Phone                 NullString `db:"phone"                   json:"phone,omitempty"`
	NotifyOnFinalWarning  bool       `db:"notify_on_final_warning" json:"notify_on_final_warning"`
	CanAbort              bool       `db:"can_abort"               json:"can_abort"`
	CanVerifyLife         bool       `db:"can_verify_life"         json:"can_verify_life"`
	CanCorroborateDeath   bool       `db:"can_corroborate_death"   json:"can_corroborate_death"`
	PhotoData             NullString `db:"photo_data"              json:"photo_data,omitempty"`
	AbortTokenHash        NullString `db:"abort_token_hash"        json:"-"`
	AbortTokenExpires     NullTime   `db:"abort_token_expires"     json:"-"`
	CreatedAt             time.Time  `db:"created_at"              json:"created_at"`
	UpdatedAt             time.Time  `db:"updated_at"              json:"updated_at"`
}

// DeliveryToken represents a time-limited access token for the beneficiary portal.
type DeliveryToken struct {
	ID                 string     `db:"id"                   json:"id"`
	VaultBeneficiaryID string     `db:"vault_beneficiary_id" json:"vault_beneficiary_id"`
	TokenHash          string     `db:"token_hash"           json:"-"`
	IsVerified         bool       `db:"is_verified"          json:"is_verified"`
	VerifiedAt         NullTime   `db:"verified_at"          json:"verified_at,omitempty"`
	ExpiresAt          time.Time  `db:"expires_at"           json:"expires_at"`
	AccessCount        int        `db:"access_count"         json:"access_count"`
	LastAccessedAt     NullTime   `db:"last_accessed_at"     json:"last_accessed_at,omitempty"`
	IPAddress          NullString `db:"ip_address"           json:"ip_address,omitempty"`
	IsRevoked          bool       `db:"is_revoked"           json:"is_revoked"`
	RevokedAt          NullTime   `db:"revoked_at"           json:"revoked_at,omitempty"`
	CreatedAt          time.Time  `db:"created_at"           json:"created_at"`
}

// VaultFile represents an encrypted file blob stored on the server.
type VaultFile struct {
	ID             string    `db:"id"              json:"id"`
	UserID         string    `db:"user_id"         json:"user_id"`
	VaultID        string    `db:"vault_id"        json:"vault_id"`
	StorageToken   string    `db:"storage_token"   json:"storage_token"`
	StoragePath    string    `db:"storage_path"    json:"-"`
	StorageBackend string    `db:"storage_backend" json:"-"`
	SizeBytes      int64     `db:"size_bytes"      json:"size_bytes"`
	CreatedAt      time.Time `db:"created_at"      json:"created_at"`
}

// AuditLog represents a single audit event.
type AuditLog struct {
	ID        string    `db:"id"         json:"id"`
	UserID    string    `db:"user_id"    json:"user_id"`
	EventType string    `db:"event_type" json:"event_type"`
	EventData string    `db:"event_data" json:"event_data"` // JSON
	IPAddress string    `db:"ip_address" json:"ip_address"`
	UserAgent string    `db:"user_agent" json:"user_agent"`
	CreatedAt time.Time `db:"created_at" json:"created_at"`
}

// EmailQueueEntry represents a queued, sent, or failed email.
type EmailQueueEntry struct {
	ID            string     `db:"id"              json:"id"`
	UserID        NullString `db:"user_id"         json:"user_id,omitempty"`
	ToEmail       string     `db:"to_email"        json:"to_email"`
	Subject       string     `db:"subject"         json:"subject"`
	TemplateName  string     `db:"template_name"   json:"template_name"`
	TemplateData  string     `db:"template_data"   json:"template_data"`
	Status        string     `db:"status"          json:"status"`
	Attempts      int        `db:"attempts"        json:"attempts"`
	LastAttemptAt NullTime   `db:"last_attempt_at" json:"last_attempt_at,omitempty"`
	SentAt        NullTime   `db:"sent_at"         json:"sent_at,omitempty"`
	ErrorMessage  NullString `db:"error_message"   json:"error_message,omitempty"`
	CreatedAt     time.Time  `db:"created_at"      json:"created_at"`
}

// PushToken represents a device push notification token for a user.
type PushToken struct {
	ID        string    `db:"id"         json:"id"`
	UserID    string    `db:"user_id"    json:"user_id"`
	Token     string    `db:"token"      json:"token"`
	Platform  string    `db:"platform"   json:"platform"`
	CreatedAt time.Time `db:"created_at" json:"created_at"`
}

// InviteCode represents a single-use registration invite.
type InviteCode struct {
	ID        string         `db:"id"         json:"id"`
	Code      string         `db:"code"       json:"code"`
	CreatedBy string         `db:"created_by" json:"created_by"`
	UsedBy    NullString `db:"used_by"    json:"used_by,omitempty"`
	ExpiresAt time.Time      `db:"expires_at" json:"expires_at"`
	UsedAt    NullTime   `db:"used_at"    json:"used_at,omitempty"`
	CreatedAt time.Time      `db:"created_at" json:"created_at"`
}

// DeathReportToken is a single-use magic link token sent to a beneficiary's email
// to verify their identity before they can submit a death report.
type DeathReportToken struct {
	ID             string     `db:"id"              json:"id"`
	TokenHash      string     `db:"token_hash"      json:"-"`
	ReporterEmail  string     `db:"reporter_email"  json:"reporter_email"`
	OwnerID        string     `db:"owner_id"        json:"owner_id"`
	BeneficiaryID  NullString `db:"beneficiary_id"  json:"beneficiary_id,omitempty"`
	ExpiresAt      time.Time  `db:"expires_at"      json:"expires_at"`
	UsedAt         NullTime   `db:"used_at"         json:"used_at,omitempty"`
	CreatedAt      time.Time  `db:"created_at"      json:"created_at"`
}

// DeathReport is a beneficiary-initiated report of the vault owner's passing.
type DeathReport struct {
	ID                   string     `db:"id"                     json:"id"`
	ReporterEmail        string     `db:"reporter_email"         json:"reporter_email"`
	OwnerID              string     `db:"owner_id"               json:"owner_id"`
	BeneficiaryID        NullString `db:"beneficiary_id"         json:"beneficiary_id,omitempty"`
	Status               string     `db:"status"                 json:"status"`
	ResponseDeadline     time.Time  `db:"response_deadline"      json:"response_deadline"`
	HalfwayAlertSent     bool       `db:"halfway_alert_sent"     json:"halfway_alert_sent"`
	VerifyTokenHash      NullString `db:"verify_token_hash"      json:"-"`
	VerifyTokenExpires   NullTime   `db:"verify_token_expires"   json:"-"`
	DateOfPassing        NullString `db:"date_of_passing"        json:"date_of_passing,omitempty"`
	Notes                NullString `db:"notes"                  json:"notes,omitempty"`
	CreatedAt            time.Time  `db:"created_at"             json:"created_at"`
	ResolvedAt           NullTime   `db:"resolved_at"            json:"resolved_at,omitempty"`
}

// DeathReportTrustedAction records a token sent to a trusted contact when a death report is filed.
// Action is either "verify_life" (contact can dismiss the report) or "corroborate" (shortens deadline).
type DeathReportTrustedAction struct {
	ID             string    `db:"id"              json:"id"`
	DeathReportID  string    `db:"death_report_id" json:"death_report_id"`
	ContactID      string    `db:"contact_id"      json:"contact_id"`
	ContactEmail   string    `db:"contact_email"   json:"contact_email"`
	ContactName    string    `db:"contact_name"    json:"contact_name"`
	Action         string    `db:"action"          json:"action"`
	TokenHash      string    `db:"token_hash"      json:"-"`
	TokenExpires   time.Time `db:"token_expires"   json:"token_expires"`
	UsedAt         NullTime  `db:"used_at"         json:"used_at,omitempty"`
	CreatedAt      time.Time `db:"created_at"      json:"created_at"`
}

// Passkey represents a WebAuthn credential registered by a user.
type Passkey struct {
	ID           string     `db:"id"            json:"id"`
	UserID       string     `db:"user_id"       json:"user_id"`
	Name         string     `db:"name"          json:"name"`
	CredentialID string     `db:"credential_id" json:"-"`
	PublicKey    string     `db:"public_key"    json:"-"`
	AAGUID       string     `db:"aaguid"        json:"aaguid"`
	SignCount     uint32     `db:"sign_count"    json:"-"`
	Transports   string     `db:"transports"    json:"transports"`
	CreatedAt    time.Time  `db:"created_at"    json:"created_at"`
	LastUsedAt   NullTime   `db:"last_used_at"  json:"last_used_at,omitempty"`
}

// WebAuthnChallenge holds short-lived ceremony state between begin and finish calls.
type WebAuthnChallenge struct {
	ID          string    `db:"id"           json:"id"`
	UserID      string    `db:"user_id"      json:"user_id"`
	SessionData string    `db:"session_data" json:"-"`
	Type        string    `db:"type"         json:"type"`
	ExpiresAt   time.Time `db:"expires_at"   json:"expires_at"`
	CreatedAt   time.Time `db:"created_at"   json:"created_at"`
}

// BeneficiaryAccessToken is a single-use magic link token that grants a beneficiary
// read-only access to the pre-trigger portal showing their vault assignment status.
type BeneficiaryAccessToken struct {
	ID        string    `db:"id"         json:"id"`
	Email     string    `db:"email"      json:"email"`
	TokenHash string    `db:"token_hash" json:"-"`
	ExpiresAt time.Time `db:"expires_at" json:"expires_at"`
	UsedAt    NullTime  `db:"used_at"    json:"used_at,omitempty"`
	CreatedAt time.Time `db:"created_at" json:"created_at"`
}
