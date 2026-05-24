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
	ID                  string    `db:"id"                    json:"id"`
	VaultID             string    `db:"vault_id"              json:"vault_id"`
	BeneficiaryID       string    `db:"beneficiary_id"        json:"beneficiary_id"`
	AdditionalDelayDays int       `db:"additional_delay_days" json:"additional_delay_days"`
	CreatedAt           time.Time `db:"created_at"            json:"created_at"`
	BeneficiaryName     string    `db:"beneficiary_name"      json:"beneficiary_name"`
	BeneficiaryEmail    string    `db:"beneficiary_email"     json:"beneficiary_email"`
	EmailConfirmed      bool      `db:"email_confirmed"       json:"email_confirmed"`
}

type BeneficiaryRepo struct {
	db *sqlx.DB
}

func (r *BeneficiaryRepo) Create(ctx context.Context, b *models.Beneficiary) error {
	_, err := r.db.NamedExecContext(ctx, `
		INSERT INTO beneficiaries (
			id, user_id, name, email, phone, relationship, notes_enc,
			email_confirm_token, email_confirm_expires, verification_method,
			secret_question_enc, secret_answer_hash
		) VALUES (
			:id, :user_id, :name, :email, :phone, :relationship, :notes_enc,
			:email_confirm_token, :email_confirm_expires, :verification_method,
			:secret_question_enc, :secret_answer_hash
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
		       b.name AS beneficiary_name, b.email AS beneficiary_email, b.email_confirmed
		FROM vault_beneficiaries vb
		JOIN beneficiaries b ON b.id = vb.beneficiary_id
		WHERE vb.vault_id = $1
		ORDER BY b.name ASC
	`, vaultID)
	return result, err
}

func (r *BeneficiaryRepo) GetDeliveryToken(ctx context.Context, tokenHash string) (*models.DeliveryToken, error) {
	var t models.DeliveryToken
	err := r.db.GetContext(ctx, &t, `
		SELECT * FROM delivery_tokens
		WHERE token_hash = $1 AND expires_at > NOW()`, tokenHash)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &t, err
}

func (r *BeneficiaryRepo) CreateDeliveryToken(ctx context.Context, t *models.DeliveryToken) error {
	_, err := r.db.NamedExecContext(ctx, `
		INSERT INTO delivery_tokens (id, vault_beneficiary_id, token_hash, expires_at)
		VALUES (:id, :vault_beneficiary_id, :token_hash, :expires_at)`, t)
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
		INSERT INTO trusted_contacts (id, user_id, name, email, phone, notify_on_final_warning, can_abort)
		VALUES (:id, :user_id, :name, :email, :phone, :notify_on_final_warning, :can_abort)`, tc)
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
			abort_token_hash = :abort_token_hash,
			abort_token_expires = :abort_token_expires,
			updated_at = NOW()
		WHERE id = :id AND user_id = :user_id`, tc)
	return err
}

func (r *BeneficiaryRepo) DeleteTrustedContact(ctx context.Context, id, userID string) error {
	_, err := r.db.ExecContext(ctx,
		`DELETE FROM trusted_contacts WHERE id = $1 AND user_id = $2`, id, userID)
	return err
}
