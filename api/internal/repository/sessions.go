package repository

import (
	"context"
	"database/sql"

	"github.com/jmoiron/sqlx"
	"github.com/ps-vault/ps-vault/internal/models"
)

type SessionRepo struct {
	db *sqlx.DB
}

func (r *SessionRepo) Create(ctx context.Context, s *models.Session) error {
	_, err := r.db.NamedExecContext(ctx, `
		INSERT INTO sessions (id, user_id, refresh_token_hash, device_info, ip_address, expires_at)
		VALUES (:id, :user_id, :refresh_token_hash, :device_info, :ip_address, :expires_at)`, s)
	return err
}

func (r *SessionRepo) GetByTokenHash(ctx context.Context, hash string) (*models.Session, error) {
	var s models.Session
	err := r.db.GetContext(ctx, &s,
		`SELECT * FROM sessions WHERE refresh_token_hash = $1 AND expires_at > NOW()`, hash)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &s, err
}

func (r *SessionRepo) ListByUser(ctx context.Context, userID string) ([]*models.Session, error) {
	var sessions []*models.Session
	err := r.db.SelectContext(ctx, &sessions,
		`SELECT * FROM sessions WHERE user_id = $1 AND expires_at > NOW() ORDER BY last_used_at DESC`,
		userID)
	return sessions, err
}

func (r *SessionRepo) Delete(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM sessions WHERE id = $1`, id)
	return err
}

func (r *SessionRepo) DeleteByIDAndUser(ctx context.Context, id, userID string) (bool, error) {
	res, err := r.db.ExecContext(ctx, `DELETE FROM sessions WHERE id = $1 AND user_id = $2`, id, userID)
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	return n > 0, err
}

func (r *SessionRepo) DeleteByTokenHash(ctx context.Context, hash string) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM sessions WHERE refresh_token_hash = $1`, hash)
	return err
}

func (r *SessionRepo) DeleteAllForUser(ctx context.Context, userID string) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM sessions WHERE user_id = $1`, userID)
	return err
}

func (r *SessionRepo) DeleteAllForUserExcept(ctx context.Context, userID, exceptID string) error {
	_, err := r.db.ExecContext(ctx,
		`DELETE FROM sessions WHERE user_id = $1 AND id != $2`, userID, exceptID)
	return err
}

func (r *SessionRepo) Touch(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE sessions SET last_used_at = NOW() WHERE id = $1`, id)
	return err
}

func (r *SessionRepo) DeleteExpired(ctx context.Context) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM sessions WHERE expires_at < NOW()`)
	return err
}
