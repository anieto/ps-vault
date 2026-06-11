package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/ps-vault/ps-vault/internal/models"
)

type PasskeyRepo struct {
	db *sqlx.DB
}

func (r *PasskeyRepo) Create(ctx context.Context, p *models.Passkey) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO passkeys (id, user_id, name, credential_id, public_key, aaguid, sign_count, transports, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
		p.ID, p.UserID, p.Name, p.CredentialID, p.PublicKey, p.AAGUID, p.SignCount, p.Transports,
	)
	return err
}

func (r *PasskeyRepo) ListByUser(ctx context.Context, userID string) ([]models.Passkey, error) {
	var passkeys []models.Passkey
	err := r.db.SelectContext(ctx, &passkeys,
		`SELECT id, user_id, name, credential_id, public_key, aaguid, sign_count, transports, created_at, last_used_at
		 FROM passkeys WHERE user_id = $1 ORDER BY created_at ASC`, userID)
	return passkeys, err
}

func (r *PasskeyRepo) GetByCredentialID(ctx context.Context, credentialID string) (*models.Passkey, error) {
	var p models.Passkey
	err := r.db.GetContext(ctx, &p,
		`SELECT id, user_id, name, credential_id, public_key, aaguid, sign_count, transports, created_at, last_used_at
		 FROM passkeys WHERE credential_id = $1`, credentialID)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *PasskeyRepo) UpdateAfterAuth(ctx context.Context, id string, signCount uint32) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE passkeys SET sign_count = $1, last_used_at = NOW() WHERE id = $2`,
		signCount, id)
	return err
}

func (r *PasskeyRepo) Rename(ctx context.Context, id, userID, name string) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE passkeys SET name = $1 WHERE id = $2 AND user_id = $3`,
		name, id, userID)
	return err
}

func (r *PasskeyRepo) Delete(ctx context.Context, id, userID string) error {
	_, err := r.db.ExecContext(ctx,
		`DELETE FROM passkeys WHERE id = $1 AND user_id = $2`, id, userID)
	return err
}

func (r *PasskeyRepo) CountByUser(ctx context.Context, userID string) (int, error) {
	var count int
	err := r.db.GetContext(ctx, &count,
		`SELECT COUNT(*) FROM passkeys WHERE user_id = $1`, userID)
	return count, err
}

// Challenge methods

func (r *PasskeyRepo) CreateChallenge(ctx context.Context, userID, sessionData, challengeType string) (string, error) {
	id := uuid.New().String()
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO webauthn_challenges (id, user_id, session_data, type, expires_at, created_at)
		VALUES ($1, $2, $3, $4, $5, NOW())`,
		id, userID, sessionData, challengeType, time.Now().Add(5*time.Minute),
	)
	return id, err
}

func (r *PasskeyRepo) GetChallenge(ctx context.Context, id, userID, challengeType string) (*models.WebAuthnChallenge, error) {
	var c models.WebAuthnChallenge
	err := r.db.GetContext(ctx, &c, `
		SELECT id, user_id, session_data, type, expires_at, created_at
		FROM webauthn_challenges
		WHERE id = $1 AND user_id = $2 AND type = $3 AND expires_at > NOW()`,
		id, userID, challengeType)
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (r *PasskeyRepo) DeleteChallenge(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM webauthn_challenges WHERE id = $1`, id)
	return err
}

func (r *PasskeyRepo) PruneExpiredChallenges(ctx context.Context) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM webauthn_challenges WHERE expires_at <= NOW()`)
	return err
}

func (r *PasskeyRepo) GetChallengeByID(ctx context.Context, id, challengeType string) (*models.WebAuthnChallenge, error) {
	var c models.WebAuthnChallenge
	err := r.db.GetContext(ctx, &c, `
		SELECT id, user_id, session_data, type, expires_at, created_at
		FROM webauthn_challenges
		WHERE id = $1 AND type = $2 AND expires_at > NOW()`,
		id, challengeType)
	if err != nil {
		return nil, err
	}
	return &c, nil
}
