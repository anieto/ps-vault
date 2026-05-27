package repository

import (
	"context"
	"database/sql"
	"time"

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
	return r.ListFiltered(ctx, userID, "", limit, offset)
}

func (r *AuditLogRepo) ListFiltered(ctx context.Context, userID, eventType string, limit, offset int) ([]*models.AuditLog, int, error) {
	var entries []*models.AuditLog
	var total int

	switch {
	case userID != "" && eventType != "":
		r.db.SelectContext(ctx, &entries, //nolint:errcheck
			`SELECT * FROM audit_log WHERE user_id = $1 AND event_type = $2 ORDER BY created_at DESC LIMIT $3 OFFSET $4`,
			userID, eventType, limit, offset)
		r.db.GetContext(ctx, &total, //nolint:errcheck
			`SELECT COUNT(*) FROM audit_log WHERE user_id = $1 AND event_type = $2`, userID, eventType)
	case userID != "":
		r.db.SelectContext(ctx, &entries, //nolint:errcheck
			`SELECT * FROM audit_log WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
			userID, limit, offset)
		r.db.GetContext(ctx, &total, `SELECT COUNT(*) FROM audit_log WHERE user_id = $1`, userID) //nolint:errcheck
	case eventType != "":
		r.db.SelectContext(ctx, &entries, //nolint:errcheck
			`SELECT * FROM audit_log WHERE event_type = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
			eventType, limit, offset)
		r.db.GetContext(ctx, &total, `SELECT COUNT(*) FROM audit_log WHERE event_type = $1`, eventType) //nolint:errcheck
	default:
		r.db.SelectContext(ctx, &entries, //nolint:errcheck
			`SELECT * FROM audit_log ORDER BY created_at DESC LIMIT $1 OFFSET $2`, limit, offset)
		r.db.GetContext(ctx, &total, `SELECT COUNT(*) FROM audit_log`) //nolint:errcheck
	}

	if entries == nil {
		entries = []*models.AuditLog{}
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

func (r *InviteCodeRepo) List(ctx context.Context) ([]*models.InviteCode, error) {
	codes := make([]*models.InviteCode, 0)
	err := r.db.SelectContext(ctx, &codes,
		`SELECT * FROM invite_codes ORDER BY created_at DESC LIMIT 100`)
	return codes, err
}

// EmailQueueRepo provides access to the email_queue table.
type EmailQueueRepo struct {
	db *sqlx.DB
}

func NewEmailQueueRepo(db *sqlx.DB) *EmailQueueRepo {
	return &EmailQueueRepo{db: db}
}

func (r *EmailQueueRepo) List(ctx context.Context, status string, limit, offset int) ([]*models.EmailQueueEntry, int, error) {
	var entries []*models.EmailQueueEntry
	var total int
	var err error

	if status != "" {
		err = r.db.SelectContext(ctx, &entries,
			`SELECT * FROM email_queue WHERE status = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
			status, limit, offset)
		if err == nil {
			r.db.GetContext(ctx, &total, `SELECT COUNT(*) FROM email_queue WHERE status = $1`, status) //nolint:errcheck
		}
	} else {
		err = r.db.SelectContext(ctx, &entries,
			`SELECT * FROM email_queue ORDER BY created_at DESC LIMIT $1 OFFSET $2`, limit, offset)
		if err == nil {
			r.db.GetContext(ctx, &total, `SELECT COUNT(*) FROM email_queue`) //nolint:errcheck
		}
	}
	return entries, total, err
}

func (r *EmailQueueRepo) GetByID(ctx context.Context, id string) (*models.EmailQueueEntry, error) {
	var e models.EmailQueueEntry
	err := r.db.GetContext(ctx, &e, `SELECT * FROM email_queue WHERE id = $1`, id)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &e, err
}

func (r *EmailQueueRepo) UpdateStatus(ctx context.Context, id, status, errMsg string) error {
	now := time.Now()
	if status == "sent" {
		_, err := r.db.ExecContext(ctx, `
			UPDATE email_queue
			SET status = $1, sent_at = $2, last_attempt_at = $2, attempts = attempts + 1, error_message = NULL
			WHERE id = $3`, status, now, id)
		return err
	}
	_, err := r.db.ExecContext(ctx, `
		UPDATE email_queue
		SET status = $1, error_message = $2, last_attempt_at = $3, attempts = attempts + 1
		WHERE id = $4`, status, errMsg, now, id)
	return err
}

func (r *EmailQueueRepo) Create(ctx context.Context, e *models.EmailQueueEntry) error {
	_, err := r.db.NamedExecContext(ctx, `
		INSERT INTO email_queue (id, user_id, to_email, subject, template_name, template_data)
		VALUES (:id, :user_id, :to_email, :subject, :template_name, :template_data)`, e)
	return err
}

func (r *EmailQueueRepo) ResetForRetry(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE email_queue SET status = 'pending', error_message = NULL WHERE id = $1`, id)
	return err
}
