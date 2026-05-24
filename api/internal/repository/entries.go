package repository

import (
	"context"
	"database/sql"

	"github.com/jmoiron/sqlx"
	"github.com/ps-vault/ps-vault/internal/models"
)

type EntryRepo struct {
	db *sqlx.DB
}

func (r *EntryRepo) Create(ctx context.Context, e *models.VaultEntry) error {
	_, err := r.db.NamedExecContext(ctx, `
		INSERT INTO vault_entries (id, vault_id, entry_type, title, encrypted_data, is_favorite, sort_order)
		VALUES (:id, :vault_id, :entry_type, :title, :encrypted_data, :is_favorite, :sort_order)`, e)
	return err
}

func (r *EntryRepo) GetByID(ctx context.Context, id string) (*models.VaultEntry, error) {
	var e models.VaultEntry
	err := r.db.GetContext(ctx, &e, `SELECT * FROM vault_entries WHERE id = $1`, id)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &e, err
}

func (r *EntryRepo) GetByIDAndVault(ctx context.Context, id, vaultID string) (*models.VaultEntry, error) {
	var e models.VaultEntry
	err := r.db.GetContext(ctx, &e,
		`SELECT * FROM vault_entries WHERE id = $1 AND vault_id = $2`, id, vaultID)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &e, err
}

func (r *EntryRepo) ListByVault(ctx context.Context, vaultID string) ([]*models.VaultEntry, error) {
	var entries []*models.VaultEntry
	err := r.db.SelectContext(ctx, &entries, `
		SELECT * FROM vault_entries
		WHERE vault_id = $1
		ORDER BY is_favorite DESC, sort_order ASC, created_at DESC`, vaultID)
	return entries, err
}

func (r *EntryRepo) Update(ctx context.Context, e *models.VaultEntry) error {
	_, err := r.db.NamedExecContext(ctx, `
		UPDATE vault_entries SET
			title = :title,
			encrypted_data = :encrypted_data,
			is_favorite = :is_favorite,
			sort_order = :sort_order,
			updated_at = NOW()
		WHERE id = :id AND vault_id = :vault_id`, e)
	return err
}

func (r *EntryRepo) Delete(ctx context.Context, id, vaultID string) error {
	_, err := r.db.ExecContext(ctx,
		`DELETE FROM vault_entries WHERE id = $1 AND vault_id = $2`, id, vaultID)
	return err
}

func (r *EntryRepo) SaveVersion(ctx context.Context, v *models.VaultEntryVersion) error {
	_, err := r.db.NamedExecContext(ctx, `
		INSERT INTO vault_entry_versions (id, entry_id, encrypted_data)
		VALUES (:id, :entry_id, :encrypted_data)`, v)
	if err != nil {
		return err
	}
	// Keep only the last 10 versions
	_, err = r.db.ExecContext(ctx, `
		DELETE FROM vault_entry_versions
		WHERE entry_id = $1
		  AND id NOT IN (
			SELECT id FROM vault_entry_versions
			WHERE entry_id = $1
			ORDER BY created_at DESC
			LIMIT 10
		  )`, v.EntryID)
	return err
}

func (r *EntryRepo) GetVersions(ctx context.Context, entryID string) ([]*models.VaultEntryVersion, error) {
	var versions []*models.VaultEntryVersion
	err := r.db.SelectContext(ctx, &versions, `
		SELECT * FROM vault_entry_versions
		WHERE entry_id = $1
		ORDER BY created_at DESC
		LIMIT 10`, entryID)
	return versions, err
}
