package repository

import (
	"context"
	"database/sql"

	"github.com/jmoiron/sqlx"
	"github.com/ps-vault/ps-vault/internal/models"
)

type VaultRepo struct {
	db *sqlx.DB
}

func (r *VaultRepo) Create(ctx context.Context, v *models.Vault) error {
	_, err := r.db.NamedExecContext(ctx, `
		INSERT INTO vaults (
			id, user_id, name, description, icon, color, status,
			delivery_message_enc, cek_envelope, check_in_interval_override,
			abort_window_override, switch_enabled, additional_delivery_delay_days,
			post_delivery_retention, post_delivery_retention_days
		) VALUES (
			:id, :user_id, :name, :description, :icon, :color, :status,
			:delivery_message_enc, :cek_envelope, :check_in_interval_override,
			:abort_window_override, :switch_enabled, :additional_delivery_delay_days,
			:post_delivery_retention, :post_delivery_retention_days
		)`, v)
	return err
}

func (r *VaultRepo) GetByID(ctx context.Context, id string) (*models.Vault, error) {
	var v models.Vault
	err := r.db.GetContext(ctx, &v, `SELECT * FROM vaults WHERE id = $1`, id)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &v, err
}

func (r *VaultRepo) GetByIDAndUser(ctx context.Context, id, userID string) (*models.Vault, error) {
	var v models.Vault
	err := r.db.GetContext(ctx, &v,
		`SELECT * FROM vaults WHERE id = $1 AND user_id = $2`, id, userID)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &v, err
}

func (r *VaultRepo) ListByUser(ctx context.Context, userID string) ([]*models.Vault, error) {
	var vaults []*models.Vault
	err := r.db.SelectContext(ctx, &vaults,
		`SELECT * FROM vaults WHERE user_id = $1 ORDER BY created_at DESC`, userID)
	return vaults, err
}

func (r *VaultRepo) ListActiveByUser(ctx context.Context, userID string) ([]*models.Vault, error) {
	var vaults []*models.Vault
	err := r.db.SelectContext(ctx, &vaults, `
		SELECT * FROM vaults
		WHERE user_id = $1 AND status = 'active' AND switch_enabled = TRUE
		ORDER BY created_at DESC`, userID)
	return vaults, err
}

func (r *VaultRepo) Update(ctx context.Context, v *models.Vault) error {
	_, err := r.db.NamedExecContext(ctx, `
		UPDATE vaults SET
			name = :name,
			description = :description,
			icon = :icon,
			color = :color,
			status = :status,
			delivery_message_enc = :delivery_message_enc,
			cek_envelope = :cek_envelope,
			check_in_interval_override = :check_in_interval_override,
			abort_window_override = :abort_window_override,
			switch_enabled = :switch_enabled,
			additional_delivery_delay_days = :additional_delivery_delay_days,
			post_delivery_retention = :post_delivery_retention,
			post_delivery_retention_days = :post_delivery_retention_days,
			access_mode = :access_mode,
			cascade_window_days = :cascade_window_days,
			updated_at = NOW()
		WHERE id = :id AND user_id = :user_id`, v)
	return err
}

func (r *VaultRepo) Delete(ctx context.Context, id, userID string) error {
	_, err := r.db.ExecContext(ctx,
		`DELETE FROM vaults WHERE id = $1 AND user_id = $2`, id, userID)
	return err
}

func (r *VaultRepo) Count(ctx context.Context) (int, error) {
	var count int
	err := r.db.GetContext(ctx, &count, `SELECT COUNT(*) FROM vaults`)
	return count, err
}

func (r *VaultRepo) CountByUser(ctx context.Context, userID string) (int, error) {
	var count int
	err := r.db.GetContext(ctx, &count, `SELECT COUNT(*) FROM vaults WHERE user_id = $1`, userID)
	return count, err
}

func (r *VaultRepo) GetAllActiveForDelivery(ctx context.Context) ([]*models.Vault, error) {
	var vaults []*models.Vault
	err := r.db.SelectContext(ctx, &vaults, `
		SELECT v.* FROM vaults v
		INNER JOIN switch_settings s ON s.user_id = v.user_id
		WHERE v.status = 'active'
		  AND v.switch_enabled = TRUE
		  AND s.status = 'triggered'
		  AND s.abort_deadline < NOW()`)
	return vaults, err
}
