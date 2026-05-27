package repository

import (
	"context"

	"github.com/jmoiron/sqlx"
	"github.com/ps-vault/ps-vault/internal/models"
)

type FileRepo struct {
	db *sqlx.DB
}

func (r *FileRepo) Create(ctx context.Context, f *models.VaultFile) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO vault_files (id, user_id, vault_id, storage_token, storage_path, storage_backend, size_bytes, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		f.ID, f.UserID, f.VaultID, f.StorageToken, f.StoragePath, f.StorageBackend, f.SizeBytes, f.CreatedAt)
	return err
}

func (r *FileRepo) GetByToken(ctx context.Context, token string) (*models.VaultFile, error) {
	var f models.VaultFile
	err := r.db.GetContext(ctx, &f,
		`SELECT * FROM vault_files WHERE storage_token = $1`, token)
	if err != nil {
		return nil, err
	}
	return &f, nil
}

func (r *FileRepo) Delete(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM vault_files WHERE id = $1`, id)
	return err
}

func (r *FileRepo) ListByVault(ctx context.Context, vaultID string) ([]*models.VaultFile, error) {
	var files []*models.VaultFile
	err := r.db.SelectContext(ctx, &files,
		`SELECT * FROM vault_files WHERE vault_id = $1 ORDER BY created_at DESC`, vaultID)
	return files, err
}

func (r *FileRepo) TotalSize(ctx context.Context) (int64, error) {
	var total int64
	err := r.db.GetContext(ctx, &total, `SELECT COALESCE(SUM(size_bytes), 0) FROM vault_files`)
	return total, err
}

func (r *FileRepo) SizeByUser(ctx context.Context, userID string) (int64, error) {
	var total int64
	err := r.db.GetContext(ctx, &total, `SELECT COALESCE(SUM(size_bytes), 0) FROM vault_files WHERE user_id = $1`, userID)
	return total, err
}
