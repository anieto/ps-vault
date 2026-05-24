package repository

import (
	"context"

	"github.com/jmoiron/sqlx"
	"github.com/ps-vault/ps-vault/internal/models"
)

type AuditLogRepo struct {
	db *sqlx.DB
}

func (r *AuditLogRepo) Log(ctx context.Context, entry *models.AuditLog) error {
	_, err := r.db.NamedExecContext(ctx, `
		INSERT INTO audit_log (id, user_id, event_type, event_data, ip_address, user_agent)
		VALUES (:id, :user_id, :event_type, :event_data, :ip_address, :user_agent)`, entry)
	return err
}

func (r *AuditLogRepo) List(ctx context.Context, userID string, limit, offset int) ([]*models.AuditLog, int, error) {
	var entries []*models.AuditLog
	var query string
	var args []interface{}

	if userID != "" {
		query = `SELECT * FROM audit_log WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`
		args = []interface{}{userID, limit, offset}
	} else {
		query = `SELECT * FROM audit_log ORDER BY created_at DESC LIMIT $1 OFFSET $2`
		args = []interface{}{limit, offset}
	}

	if err := r.db.SelectContext(ctx, &entries, query, args...); err != nil {
		return nil, 0, err
	}

	var total int
	if userID != "" {
		r.db.GetContext(ctx, &total, `SELECT COUNT(*) FROM audit_log WHERE user_id = $1`, userID)
	} else {
		r.db.GetContext(ctx, &total, `SELECT COUNT(*) FROM audit_log`)
	}

	return entries, total, nil
}

type InviteCodeRepo struct {
	db *sqlx.DB
}

func (r *InviteCodeRepo) Create(ctx context.Context, ic *models.InviteCode) error {
	_, err := r.db.NamedExecContext(ctx, `
		INSERT INTO invite_codes (id, code, created_by, expires_at)
		VALUES (:id, :code, :created_by, :expires_at)`, ic)
	return err
}

func (r *InviteCodeRepo) GetByCode(ctx context.Context, code string) (*models.InviteCode, error) {
	var ic models.InviteCode
	err := r.db.GetContext(ctx, &ic, `
		SELECT * FROM invite_codes
		WHERE code = $1 AND expires_at > NOW() AND used_at IS NULL`, code)
	if err != nil {
		return nil, nil
	}
	return &ic, nil
}

func (r *InviteCodeRepo) MarkUsed(ctx context.Context, id, usedBy string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE invite_codes SET used_by = $1, used_at = NOW() WHERE id = $2`, usedBy, id)
	return err
}
