package repository

import (
	"context"
	"database/sql"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/ps-vault/ps-vault/internal/models"
)

// VaultBeneficiaryDetail joins vault_beneficiaries with beneficiary info.
type VaultBeneficiaryDetail struct {
	ID                   string            `db:"id"                      json:"id"`
	VaultID              string            `db:"vault_id"                json:"vault_id"`
	BeneficiaryID        string            `db:"beneficiary_id"          json:"beneficiary_id"`
	AdditionalDelayDays  int               `db:"additional_delay_days"   json:"additional_delay_days"`
	CreatedAt            time.Time         `db:"created_at"              json:"created_at"`
	BeneficiaryName      string            `db:"beneficiary_name"        json:"beneficiary_name"`
	BeneficiaryEmail     string            `db:"beneficiary_email"       json:"beneficiary_email"`
	EmailConfirmed       bool              `db:"email_confirmed"         json:"email_confirmed"`
	BeneficiaryPhotoData models.NullString `db:"beneficiary_photo_data"  json:"beneficiary_photo_data,omitempty"`
	Tier                 models.NullString `db:"tier"                    json:"tier,omitempty"`
	TierUnlockedAt       models.NullTime   `db:"tier_unlocked_at"        json:"tier_unlocked_at,omitempty"`
}

type BeneficiaryRepo struct {
	db *sqlx.DB
}

func (r *BeneficiaryRepo) Create(ctx context.Context, b *models.Beneficiary) error {
	_, err := r.db.NamedExecContext(ctx, `
		INSERT INTO beneficiaries (
			id, user_id, name, email, phone, relationship, notes_enc,
			email_confirm_token, email_confirm_expires, verification_method,
			secret_question_enc, secret_answer_hash, photo_data
		) VALUES (
			:id, :user_id, :name, :email, :phone, :relationship, :notes_enc,
			:email_confirm_token, :email_confirm_expires, :verification_method,
			:secret_question_enc, :secret_answer_hash, :photo_data
		)`, b)
	return err
}

func (r *BeneficiaryRepo) GetByID(ctx context.Context, id string) (*models.Beneficiary, error) {
	var b models.Beneficiary
	err := r.db.GetContext(ctx, &b, `SELECT * FROM beneficiaries WHERE id = $1`, id)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &b, err
}

func (r *BeneficiaryRepo) GetByIDAndUser(ctx context.Context, id, userID string) (*models.Beneficiary, error) {
	var b models.Beneficiary
	err := r.db.GetContext(ctx, &b,
		`SELECT * FROM beneficiaries WHERE id = $1 AND user_id = $2`, id, userID)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &b, err
}

func (r *BeneficiaryRepo) ListByUser(ctx context.Context, userID string) ([]*models.Beneficiary, error) {
	var beneficiaries []*models.Beneficiary
	err := r.db.SelectContext(ctx, &beneficiaries,
		`SELECT * FROM beneficiaries WHERE user_id = $1 ORDER BY name ASC`, userID)
	return beneficiaries, err
}

// GetByEmail returns all beneficiary records with the given email (across all owners).
func (r *BeneficiaryRepo) GetByEmail(ctx context.Context, email string) ([]*models.Beneficiary, error) {
	var beneficiaries []*models.Beneficiary
	err := r.db.SelectContext(ctx, &beneficiaries,
		`SELECT * FROM beneficiaries WHERE LOWER(email) = LOWER($1)`, email)
	return beneficiaries, err
}

func (r *BeneficiaryRepo) Update(ctx context.Context, b *models.Beneficiary) error {
	_, err := r.db.NamedExecContext(ctx, `
		UPDATE beneficiaries SET
			name = :name,
			email = :email,
			phone = :phone,
			relationship = :relationship,
			notes_enc = :notes_enc,
			email_confirmed = :email_confirmed,
			email_confirm_token = :email_confirm_token,
			email_confirm_expires = :email_confirm_expires,
			verification_method = :verification_method,
			secret_question_enc = :secret_question_enc,
			secret_answer_hash = :secret_answer_hash,
			photo_data = :photo_data,
			phone_verified = :phone_verified,
			is_active = :is_active,
			updated_at = NOW()
		WHERE id = :id AND user_id = :user_id`, b)
	return err
}

func (r *BeneficiaryRepo) Delete(ctx context.Context, id, userID string) error {
	_, err := r.db.ExecContext(ctx,
		`DELETE FROM beneficiaries WHERE id = $1 AND user_id = $2`, id, userID)
	return err
}

func (r *BeneficiaryRepo) GetByConfirmToken(ctx context.Context, token string) (*models.Beneficiary, error) {
	var b models.Beneficiary
	err := r.db.GetContext(ctx, &b, `
		SELECT * FROM beneficiaries
		WHERE email_confirm_token = $1 AND email_confirm_expires > NOW()`, token)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &b, err
}

func (r *BeneficiaryRepo) AssignToVault(ctx context.Context, vb *models.VaultBeneficiary) error {
	_, err := r.db.NamedExecContext(ctx, `
		INSERT INTO vault_beneficiaries (id, vault_id, beneficiary_id, beneficiary_cek_envelope, additional_delay_days)
		VALUES (:id, :vault_id, :beneficiary_id, :beneficiary_cek_envelope, :additional_delay_days)
		ON CONFLICT (vault_id, beneficiary_id) DO UPDATE SET
			beneficiary_cek_envelope = EXCLUDED.beneficiary_cek_envelope,
			additional_delay_days = EXCLUDED.additional_delay_days`, vb)
	return err
}

func (r *BeneficiaryRepo) RemoveFromVault(ctx context.Context, vaultID, beneficiaryID string) error {
	_, err := r.db.ExecContext(ctx,
		`DELETE FROM vault_beneficiaries WHERE vault_id = $1 AND beneficiary_id = $2`,
		vaultID, beneficiaryID)
	return err
}

func (r *BeneficiaryRepo) GetVaultAssignments(ctx context.Context, vaultID string) ([]*models.VaultBeneficiary, error) {
	var assignments []*models.VaultBeneficiary
	err := r.db.SelectContext(ctx, &assignments,
		`SELECT * FROM vault_beneficiaries WHERE vault_id = $1`, vaultID)
	return assignments, err
}

func (r *BeneficiaryRepo) GetVaultAssignmentsWithInfo(ctx context.Context, vaultID string) ([]*VaultBeneficiaryDetail, error) {
	var result []*VaultBeneficiaryDetail
	err := r.db.SelectContext(ctx, &result, `
		SELECT vb.id, vb.vault_id, vb.beneficiary_id, vb.additional_delay_days, vb.created_at,
		       b.name AS beneficiary_name, b.email AS beneficiary_email, b.email_confirmed,
		       b.photo_data AS beneficiary_photo_data,
		       vb.tier, vb.tier_unlocked_at
		FROM vault_beneficiaries vb
		JOIN beneficiaries b ON b.id = vb.beneficiary_id
		WHERE vb.vault_id = $1
		ORDER BY b.name ASC
	`, vaultID)
	return result, err
}

type BeneficiaryVaultItem struct {
	ID   string  `db:"id"   json:"id"`
	Name string  `db:"name" json:"name"`
	Icon string  `db:"icon" json:"icon"`
	Tier *string `db:"tier" json:"tier,omitempty"`
}

func (r *BeneficiaryRepo) GetVaultsByBeneficiary(ctx context.Context, beneficiaryID, userID string) ([]*BeneficiaryVaultItem, error) {
	items := make([]*BeneficiaryVaultItem, 0)
	err := r.db.SelectContext(ctx, &items, `
		SELECT v.id, v.name, v.icon, vb.tier
		FROM vaults v
		JOIN vault_beneficiaries vb ON vb.vault_id = v.id
		WHERE vb.beneficiary_id = $1
		  AND v.user_id = $2
		ORDER BY v.name ASC
	`, beneficiaryID, userID)
	return items, err
}

func (r *BeneficiaryRepo) GetDeliveryToken(ctx context.Context, tokenHash string) (*models.DeliveryToken, error) {
	var t models.DeliveryToken
	err := r.db.GetContext(ctx, &t, `
		SELECT * FROM delivery_tokens
		WHERE token_hash = $1 AND expires_at > NOW() AND is_revoked = false`, tokenHash)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &t, err
}

func (r *BeneficiaryRepo) RevokeDeliveryTokensForUser(ctx context.Context, userID string) (int64, error) {
	res, err := r.db.ExecContext(ctx, `
		UPDATE delivery_tokens dt
		SET is_revoked = true, revoked_at = NOW()
		FROM vault_beneficiaries vb
		JOIN vaults v ON v.id = vb.vault_id
		WHERE dt.vault_beneficiary_id = vb.id
		  AND v.user_id = $1
		  AND dt.is_revoked = false
		  AND dt.expires_at > NOW()`, userID)
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	return n, nil
}

func (r *BeneficiaryRepo) CreateDeliveryToken(ctx context.Context, t *models.DeliveryToken) error {
	_, err := r.db.NamedExecContext(ctx, `
		INSERT INTO delivery_tokens (id, vault_beneficiary_id, token_hash, expires_at)
		VALUES (:id, :vault_beneficiary_id, :token_hash, :expires_at)`, t)
	return err
}

func (r *BeneficiaryRepo) MarkDeliveryTokenVerified(ctx context.Context, id, ip string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE delivery_tokens SET
			is_verified      = true,
			verified_at      = NOW(),
			access_count     = access_count + 1,
			last_accessed_at = NOW(),
			ip_address       = $2
		WHERE id = $1`, id, ip)
	return err
}

func (r *BeneficiaryRepo) UpdateDeliveryToken(ctx context.Context, t *models.DeliveryToken) error {
	_, err := r.db.NamedExecContext(ctx, `
		UPDATE delivery_tokens SET
			is_verified = :is_verified,
			verified_at = :verified_at,
			access_count = :access_count,
			last_accessed_at = :last_accessed_at,
			ip_address = :ip_address
		WHERE id = :id`, t)
	return err
}

func (r *BeneficiaryRepo) GetVaultBeneficiaryByID(ctx context.Context, id string) (*models.VaultBeneficiary, error) {
	var vb models.VaultBeneficiary
	err := r.db.GetContext(ctx, &vb, `SELECT * FROM vault_beneficiaries WHERE id = $1`, id)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &vb, err
}

func (r *BeneficiaryRepo) GetTrustedContacts(ctx context.Context, userID string) ([]*models.TrustedContact, error) {
	var contacts []*models.TrustedContact
	err := r.db.SelectContext(ctx, &contacts,
		`SELECT * FROM trusted_contacts WHERE user_id = $1 ORDER BY name ASC`, userID)
	return contacts, err
}

func (r *BeneficiaryRepo) CreateTrustedContact(ctx context.Context, tc *models.TrustedContact) error {
	_, err := r.db.NamedExecContext(ctx, `
		INSERT INTO trusted_contacts (id, user_id, name, email, phone, notify_on_final_warning, can_abort, can_verify_life, can_corroborate_death)
		VALUES (:id, :user_id, :name, :email, :phone, :notify_on_final_warning, :can_abort, :can_verify_life, :can_corroborate_death)`, tc)
	return err
}

func (r *BeneficiaryRepo) UpdateTrustedContact(ctx context.Context, tc *models.TrustedContact) error {
	_, err := r.db.NamedExecContext(ctx, `
		UPDATE trusted_contacts SET
			name = :name,
			email = :email,
			phone = :phone,
			notify_on_final_warning = :notify_on_final_warning,
			can_abort = :can_abort,
			can_verify_life = :can_verify_life,
			can_corroborate_death = :can_corroborate_death,
			abort_token_hash = :abort_token_hash,
			abort_token_expires = :abort_token_expires,
			updated_at = NOW()
		WHERE id = :id AND user_id = :user_id`, tc)
	return err
}

func (r *BeneficiaryRepo) GetTrustedContactByID(ctx context.Context, id, userID string) (*models.TrustedContact, error) {
	var tc models.TrustedContact
	err := r.db.GetContext(ctx, &tc,
		`SELECT * FROM trusted_contacts WHERE id = $1 AND user_id = $2`, id, userID)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &tc, err
}

func (r *BeneficiaryRepo) DeleteTrustedContact(ctx context.Context, id, userID string) error {
	_, err := r.db.ExecContext(ctx,
		`DELETE FROM trusted_contacts WHERE id = $1 AND user_id = $2`, id, userID)
	return err
}

func (r *BeneficiaryRepo) GetTrustedContactByAbortToken(ctx context.Context, tokenHash string) (*models.TrustedContact, error) {
	var tc models.TrustedContact
	err := r.db.GetContext(ctx, &tc,
		`SELECT * FROM trusted_contacts
		 WHERE abort_token_hash = $1 AND abort_token_expires > NOW()`, tokenHash)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &tc, err
}

func (r *BeneficiaryRepo) ClearAbortToken(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE trusted_contacts SET abort_token_hash = NULL, abort_token_expires = NULL, updated_at = NOW()
		 WHERE id = $1`, id)
	return err
}

func (r *BeneficiaryRepo) UpdateVaultBeneficiaryTier(ctx context.Context, vaultID, beneficiaryID string, tier *string, cascadeWindowDays *int) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE vault_beneficiaries SET
			tier = $1,
			tier_cascade_window_days = $2
		WHERE vault_id = $3 AND beneficiary_id = $4`,
		tier, cascadeWindowDays, vaultID, beneficiaryID)
	return err
}

func (r *BeneficiaryRepo) GetPendingCascades(ctx context.Context) ([]*models.VaultBeneficiary, error) {
	var vbs []*models.VaultBeneficiary
	err := r.db.SelectContext(ctx, &vbs, `
		SELECT vb.*
		FROM vault_beneficiaries vb
		JOIN vaults v ON v.id = vb.vault_id
		WHERE v.access_mode = 'cascading'
		  AND vb.tier IS NOT NULL
		  AND vb.tier_unlocked_at IS NOT NULL
		  AND NOT EXISTS (
			SELECT 1 FROM delivery_tokens dt
			JOIN vault_beneficiaries vb2 ON vb2.id = dt.vault_beneficiary_id
			WHERE vb2.vault_id = vb.vault_id
			  AND vb2.tier = vb.tier
			  AND dt.access_count > 0
			  AND dt.is_revoked = false
		  )
		  AND (
			SELECT tier_unlocked_at + COALESCE(vb.tier_cascade_window_days, v.cascade_window_days) * INTERVAL '1 day'
			FROM vaults v2 WHERE v2.id = vb.vault_id
		  ) < NOW()
	`)
	return vbs, err
}

func (r *BeneficiaryRepo) UnlockNextTier(ctx context.Context, vaultID string, currentTier string) error {
	nextTier := map[string]string{
		"primary":   "secondary",
		"secondary": "tertiary",
	}
	next, ok := nextTier[currentTier]
	if !ok {
		return nil // tertiary has no next tier
	}
	_, err := r.db.ExecContext(ctx, `
		UPDATE vault_beneficiaries SET tier_unlocked_at = NOW()
		WHERE vault_id = $1 AND tier = $2 AND tier_unlocked_at IS NULL`,
		vaultID, next)
	return err
}

// UnlockTier sets tier_unlocked_at = NOW() for a specific tier in a vault.
// Used during initial delivery to mark primary tier as unlocked.
func (r *BeneficiaryRepo) UnlockTier(ctx context.Context, vaultID, tier string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE vault_beneficiaries SET tier_unlocked_at = NOW()
		WHERE vault_id = $1 AND tier = $2 AND tier_unlocked_at IS NULL`,
		vaultID, tier)
	return err
}

// GetVaultAssignmentsByTier returns vault_beneficiary rows for a specific tier in a vault.
func (r *BeneficiaryRepo) GetVaultAssignmentsByTier(ctx context.Context, vaultID, tier string) ([]*models.VaultBeneficiary, error) {
	var assignments []*models.VaultBeneficiary
	err := r.db.SelectContext(ctx, &assignments,
		`SELECT * FROM vault_beneficiaries WHERE vault_id = $1 AND tier = $2`, vaultID, tier)
	return assignments, err
}

// ─── Beneficiary Access Tokens ────────────────────────────────────────────────

func (r *BeneficiaryRepo) CreateAccessToken(ctx context.Context, t *models.BeneficiaryAccessToken) error {
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO beneficiary_access_tokens (id, email, token_hash, expires_at, created_at)
		 VALUES ($1, $2, $3, $4, $5)`,
		t.ID, t.Email, t.TokenHash, t.ExpiresAt, t.CreatedAt)
	return err
}

func (r *BeneficiaryRepo) GetAccessTokenByHash(ctx context.Context, hash string) (*models.BeneficiaryAccessToken, error) {
	var t models.BeneficiaryAccessToken
	err := r.db.GetContext(ctx, &t,
		`SELECT * FROM beneficiary_access_tokens
		 WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()`, hash)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &t, err
}

func (r *BeneficiaryRepo) MarkAccessTokenUsed(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE beneficiary_access_tokens SET used_at = NOW() WHERE id = $1`, id)
	return err
}

// CountVaultsByBeneficiaryID returns how many vaults a beneficiary is assigned to.
func (r *BeneficiaryRepo) CountVaultsByBeneficiaryID(ctx context.Context, beneficiaryID string) (int, error) {
	var count int
	err := r.db.GetContext(ctx, &count,
		`SELECT COUNT(*) FROM vault_beneficiaries WHERE beneficiary_id = $1`, beneficiaryID)
	return count, err
}
