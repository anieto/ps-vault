package repository

import (
	"context"

	"github.com/jmoiron/sqlx"
	"github.com/ps-vault/ps-vault/internal/models"
)

type PushTokenRepo struct {
	db *sqlx.DB
}

func (r *PushTokenRepo) Save(ctx context.Context, t *models.PushToken) error {
	_, err := r.db.NamedExecContext(ctx, `
		INSERT INTO user_push_tokens (user_id, token, platform)
		VALUES (:user_id, :token, :platform)
		ON CONFLICT (user_id, token) DO NOTHING`, t)
	return err
}

func (r *PushTokenRepo) DeleteByUserAndToken(ctx context.Context, userID, token string) error {
	_, err := r.db.ExecContext(ctx,
		`DELETE FROM user_push_tokens WHERE user_id = $1 AND token = $2`, userID, token)
	return err
}

func (r *PushTokenRepo) DeleteAllForUser(ctx context.Context, userID string) error {
	_, err := r.db.ExecContext(ctx,
		`DELETE FROM user_push_tokens WHERE user_id = $1`, userID)
	return err
}

func (r *PushTokenRepo) GetByUserID(ctx context.Context, userID string) ([]*models.PushToken, error) {
	tokens := make([]*models.PushToken, 0)
	err := r.db.SelectContext(ctx, &tokens,
		`SELECT * FROM user_push_tokens WHERE user_id = $1`, userID)
	return tokens, err
}
