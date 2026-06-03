package repository

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/jmoiron/sqlx"
	"github.com/ps-vault/ps-vault/internal/models"
)

type UserRepo struct {
	db *sqlx.DB
}

func (r *UserRepo) Create(ctx context.Context, u *models.User) error {
	query := `
		INSERT INTO users (
			id, email, display_name, password_hash, key_verification_hash,
			argon2_params, mek_salt, mek_envelope,
			email_verify_token, email_verify_expires, role, timezone
		) VALUES (
			:id, :email, :display_name, :password_hash, :key_verification_hash,
			:argon2_params, :mek_salt, :mek_envelope,
			:email_verify_token, :email_verify_expires, :role, :timezone
		)`
	_, err := r.db.NamedExecContext(ctx, query, u)
	return err
}

func (r *UserRepo) GetByID(ctx context.Context, id string) (*models.User, error) {
	var u models.User
	err := r.db.GetContext(ctx, &u, `SELECT * FROM users WHERE id = $1`, id)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &u, err
}

func (r *UserRepo) GetByEmail(ctx context.Context, email string) (*models.User, error) {
	var u models.User
	err := r.db.GetContext(ctx, &u, `SELECT * FROM users WHERE email = $1`, email)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &u, err
}

func (r *UserRepo) GetByVerifyToken(ctx context.Context, token string) (*models.User, error) {
	var u models.User
	err := r.db.GetContext(ctx, &u,
		`SELECT * FROM users WHERE email_verify_token = $1 AND email_verify_expires > NOW()`, token)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &u, err
}

func (r *UserRepo) Update(ctx context.Context, u *models.User) error {
	query := `
		UPDATE users SET
			display_name = :display_name,
			email = :email,
			password_hash = :password_hash,
			key_verification_hash = :key_verification_hash,
			argon2_params = :argon2_params,
			email_verified = :email_verified,
			email_verify_token = :email_verify_token,
			email_verify_expires = :email_verify_expires,
			mfa_enabled = :mfa_enabled,
			mfa_secret = :mfa_secret,
			mfa_backup_codes = :mfa_backup_codes,
			role = :role,
			is_active = :is_active,
			timezone = :timezone,
			failed_login_attempts = :failed_login_attempts,
			locked_until = :locked_until,
			last_login_at = :last_login_at,
			updated_at = NOW()
		WHERE id = :id`
	_, err := r.db.NamedExecContext(ctx, query, u)
	return err
}

func (r *UserRepo) Delete(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM users WHERE id = $1`, id)
	return err
}

func (r *UserRepo) IncrementFailedLogins(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE users SET
			failed_login_attempts = failed_login_attempts + 1,
			locked_until = CASE
				WHEN failed_login_attempts + 1 >= 10
				THEN NOW() + INTERVAL '15 minutes'
				ELSE locked_until
			END,
			updated_at = NOW()
		WHERE id = $1`, id)
	return err
}

func (r *UserRepo) ResetFailedLogins(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE users SET failed_login_attempts = 0, locked_until = NULL, updated_at = NOW()
		WHERE id = $1`, id)
	return err
}

func (r *UserRepo) List(ctx context.Context, limit, offset int) ([]*models.User, int, error) {
	users := make([]*models.User, 0)
	err := r.db.SelectContext(ctx, &users,
		`SELECT * FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2`, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	var total int
	err = r.db.GetContext(ctx, &total, `SELECT COUNT(*) FROM users`)
	return users, total, err
}

func (r *UserRepo) CountAdmins(ctx context.Context) (int, error) {
	var count int
	err := r.db.GetContext(ctx, &count, `SELECT COUNT(*) FROM users WHERE role = 'admin'`)
	return count, err
}

func (r *UserRepo) ListAdmins(ctx context.Context) ([]*models.User, error) {
	users := make([]*models.User, 0)
	err := r.db.SelectContext(ctx, &users, `SELECT * FROM users WHERE role = 'admin' AND is_active = true ORDER BY created_at ASC`)
	return users, err
}

func (r *UserRepo) Count(ctx context.Context) (int, error) {
	var count int
	err := r.db.GetContext(ctx, &count, `SELECT COUNT(*) FROM users`)
	return count, err
}

func (r *UserRepo) EmailExists(ctx context.Context, email string) (bool, error) {
	var exists bool
	err := r.db.GetContext(ctx, &exists,
		`SELECT EXISTS(SELECT 1 FROM users WHERE email = $1)`, email)
	return exists, err
}

func (r *UserRepo) SetRole(ctx context.Context, id, role string) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2`, role, id)
	return err
}

func (r *UserRepo) SetActive(ctx context.Context, id string, active bool) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE users SET is_active = $1, updated_at = NOW() WHERE id = $2`, active, id)
	return err
}

func (r *UserRepo) MarkEmailVerified(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE users SET
			email_verified = TRUE,
			email_verify_token = NULL,
			email_verify_expires = NULL,
			updated_at = NOW()
		WHERE id = $1`, id)
	return err
}

func (r *UserRepo) SetVerifyToken(ctx context.Context, id, token string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE users SET
			email_verify_token = $1,
			email_verify_expires = NOW() + INTERVAL '24 hours',
			updated_at = NOW()
		WHERE id = $2`, token, id)
	return err
}

func (r *UserRepo) SetEmailChangeToken(ctx context.Context, id, pendingEmail, token string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE users SET
			pending_email = $1,
			email_change_token = $2,
			email_change_expires = NOW() + INTERVAL '24 hours',
			updated_at = NOW()
		WHERE id = $3`, pendingEmail, token, id)
	return err
}

func (r *UserRepo) GetByEmailChangeToken(ctx context.Context, token string) (*models.User, error) {
	var u models.User
	err := r.db.GetContext(ctx, &u, `
		SELECT * FROM users
		WHERE email_change_token = $1
		  AND email_change_expires > NOW()`, token)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (r *UserRepo) ApplyEmailChange(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE users SET
			email = pending_email,
			pending_email = NULL,
			email_change_token = NULL,
			email_change_expires = NULL,
			updated_at = NOW()
		WHERE id = $1`, id)
	return err
}

func (r *UserRepo) GetByResetToken(ctx context.Context, tokenHash string) (*models.User, error) {
	// Password reset tokens stored in email_verify_token temporarily
	// A dedicated password_reset_tokens table would be cleaner in future
	var u models.User
	err := r.db.GetContext(ctx, &u, `
		SELECT * FROM users
		WHERE email_verify_token = $1
		  AND email_verify_expires > NOW()
		  AND email_verified = TRUE`, tokenHash)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &u, err
}

func (r *UserRepo) UpdatePassword(ctx context.Context, id, passwordHash, kvh, argon2Params, mekEnvelope string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE users SET
			password_hash = $1,
			key_verification_hash = $2,
			argon2_params = $3,
			mek_envelope = $4,
			email_verify_token = NULL,
			email_verify_expires = NULL,
			updated_at = NOW()
		WHERE id = $5`, passwordHash, kvh, argon2Params, mekEnvelope, id)
	return err
}

func (r *UserRepo) SetMEKEnvelope(ctx context.Context, id, mekEnvelope string) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE users SET mek_envelope = $1, updated_at = NOW() WHERE id = $2`,
		mekEnvelope, id)
	return err
}

func (r *UserRepo) SetRecoveryKeyEnvelope(ctx context.Context, id, envelope string) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE users SET recovery_key_envelope = $1, updated_at = NOW() WHERE id = $2`,
		envelope, id)
	return err
}

func (r *UserRepo) UpdateMFA(ctx context.Context, id string, enabled bool, secret, backupCodes string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE users SET
			mfa_enabled = $1,
			mfa_secret = $2,
			mfa_backup_codes = $3,
			updated_at = NOW()
		WHERE id = $4`, enabled, secret, backupCodes, id)
	return err
}

func (r *UserRepo) UpdateLastLogin(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1`, id)
	return err
}

func (r *UserRepo) UpdateCEKEnvelopes(ctx context.Context, id string, envelopes map[string]string) error {
	// Update all vault CEK envelopes in a transaction when password changes
	tx, err := r.db.BeginTxx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	for vaultID, envelope := range envelopes {
		_, err := tx.ExecContext(ctx,
			`UPDATE vaults SET cek_envelope = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3`,
			envelope, vaultID, id)
		if err != nil {
			return fmt.Errorf("updating vault %s CEK envelope: %w", vaultID, err)
		}
	}
	return tx.Commit()
}
