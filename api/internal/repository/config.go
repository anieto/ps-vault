package repository

import (
	"context"
	"time"

	"github.com/jmoiron/sqlx"
)

type SystemConfigRepo struct {
	db *sqlx.DB
}

func (r *SystemConfigRepo) Get(ctx context.Context, key string) (string, error) {
	var value string
	err := r.db.QueryRowContext(ctx,
		`SELECT value FROM system_config WHERE key = $1`, key).Scan(&value)
	return value, err
}

func (r *SystemConfigRepo) Set(ctx context.Context, key, value string) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO system_config (key, value, updated_at)
		VALUES ($1, $2, $3)
		ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = $3`,
		key, value, time.Now())
	return err
}

func (r *SystemConfigRepo) GetAll(ctx context.Context) (map[string]string, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT key, value FROM system_config ORDER BY key`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[string]string)
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			return nil, err
		}
		result[k] = v
	}
	return result, rows.Err()
}

func NewSystemConfigRepo(db *sqlx.DB) *SystemConfigRepo {
	return &SystemConfigRepo{db: db}
}
