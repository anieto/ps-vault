package repository

import (
	"context"
	"database/sql"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/ps-vault/ps-vault/internal/models"
)

type DeathReportRepo struct {
	db *sqlx.DB
}

// ─── Tokens ───────────────────────────────────────────────────────────────────

func (r *DeathReportRepo) CreateToken(ctx context.Context, t *models.DeathReportToken) error {
	_, err := r.db.NamedExecContext(ctx, `
		INSERT INTO death_report_tokens
			(id, token_hash, reporter_email, owner_id, beneficiary_id, expires_at, created_at)
		VALUES
			(:id, :token_hash, :reporter_email, :owner_id, :beneficiary_id, :expires_at, :created_at)`, t)
	return err
}

func (r *DeathReportRepo) GetTokenByHash(ctx context.Context, hash string) (*models.DeathReportToken, error) {
	var t models.DeathReportToken
	err := r.db.GetContext(ctx, &t, `
		SELECT * FROM death_report_tokens
		WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()`, hash)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &t, err
}

func (r *DeathReportRepo) MarkTokenUsed(ctx context.Context, id string) error {
	now := time.Now()
	_, err := r.db.ExecContext(ctx, `UPDATE death_report_tokens SET used_at = $1 WHERE id = $2`, now, id)
	return err
}

// ─── Reports ──────────────────────────────────────────────────────────────────

func (r *DeathReportRepo) Create(ctx context.Context, dr *models.DeathReport) error {
	_, err := r.db.NamedExecContext(ctx, `
		INSERT INTO death_reports
			(id, reporter_email, owner_id, beneficiary_id, status, response_deadline,
			 halfway_alert_sent, verify_token_hash, verify_token_expires,
			 date_of_passing, notes, created_at)
		VALUES
			(:id, :reporter_email, :owner_id, :beneficiary_id, :status, :response_deadline,
			 :halfway_alert_sent, :verify_token_hash, :verify_token_expires,
			 :date_of_passing, :notes, :created_at)`, dr)
	return err
}

func (r *DeathReportRepo) GetByID(ctx context.Context, id string) (*models.DeathReport, error) {
	var dr models.DeathReport
	err := r.db.GetContext(ctx, &dr, `SELECT * FROM death_reports WHERE id = $1`, id)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &dr, err
}

// GetActiveForOwner returns a pending death report for the given owner, if one exists.
func (r *DeathReportRepo) GetActiveForOwner(ctx context.Context, ownerID string) (*models.DeathReport, error) {
	var dr models.DeathReport
	err := r.db.GetContext(ctx, &dr, `
		SELECT * FROM death_reports WHERE owner_id = $1 AND status = 'pending'
		ORDER BY created_at DESC LIMIT 1`, ownerID)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &dr, err
}

// HasActiveReport checks whether a beneficiary already has a pending report against an owner.
func (r *DeathReportRepo) HasActiveReport(ctx context.Context, reporterEmail, ownerID string) (bool, error) {
	var count int
	err := r.db.GetContext(ctx, &count, `
		SELECT COUNT(*) FROM death_reports
		WHERE reporter_email = $1 AND owner_id = $2 AND status = 'pending'`, reporterEmail, ownerID)
	return count > 0, err
}

func (r *DeathReportRepo) SetVerifyToken(ctx context.Context, id, tokenHash string, expires time.Time) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE death_reports SET verify_token_hash = $1, verify_token_expires = $2 WHERE id = $3`,
		tokenHash, expires, id)
	return err
}

func (r *DeathReportRepo) GetByVerifyToken(ctx context.Context, tokenHash string) (*models.DeathReport, error) {
	var dr models.DeathReport
	err := r.db.GetContext(ctx, &dr, `
		SELECT * FROM death_reports
		WHERE verify_token_hash = $1 AND verify_token_expires > NOW() AND status = 'pending'`, tokenHash)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &dr, err
}

func (r *DeathReportRepo) Dismiss(ctx context.Context, id string) error {
	now := time.Now()
	_, err := r.db.ExecContext(ctx, `
		UPDATE death_reports SET status = 'dismissed', resolved_at = $1,
		verify_token_hash = NULL, verify_token_expires = NULL WHERE id = $2`, now, id)
	return err
}

func (r *DeathReportRepo) MarkTriggered(ctx context.Context, id string) error {
	now := time.Now()
	_, err := r.db.ExecContext(ctx, `
		UPDATE death_reports SET status = 'triggered', resolved_at = $1 WHERE id = $2`, now, id)
	return err
}

// GetPendingPastHalfway returns pending reports that have passed their halfway mark but haven't sent the halfway alert.
func (r *DeathReportRepo) GetPendingPastHalfway(ctx context.Context) ([]*models.DeathReport, error) {
	var reports []*models.DeathReport
	err := r.db.SelectContext(ctx, &reports, `
		SELECT * FROM death_reports
		WHERE status = 'pending'
		  AND halfway_alert_sent = FALSE
		  AND NOW() > created_at + (response_deadline - created_at) / 2`)
	return reports, err
}

// GetPendingPastDeadline returns pending reports whose response deadline has passed.
func (r *DeathReportRepo) GetPendingPastDeadline(ctx context.Context) ([]*models.DeathReport, error) {
	var reports []*models.DeathReport
	err := r.db.SelectContext(ctx, &reports, `
		SELECT * FROM death_reports WHERE status = 'pending' AND response_deadline < NOW()`)
	return reports, err
}

func (r *DeathReportRepo) MarkHalfwaySent(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx, `UPDATE death_reports SET halfway_alert_sent = TRUE WHERE id = $1`, id)
	return err
}

// ShortenDeadline updates the response deadline if the new deadline is sooner than the current one.
// Resets halfway_alert_sent so a fresh halfway reminder can fire for the shortened window.
func (r *DeathReportRepo) ShortenDeadline(ctx context.Context, id string, newDeadline time.Time) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE death_reports
		SET response_deadline = $1, halfway_alert_sent = FALSE
		WHERE id = $2 AND status = 'pending' AND response_deadline > $1`, newDeadline, id)
	return err
}

// ─── Trusted Actions ──────────────────────────────────────────────────────────

func (r *DeathReportRepo) CreateTrustedAction(ctx context.Context, a *models.DeathReportTrustedAction) error {
	_, err := r.db.NamedExecContext(ctx, `
		INSERT INTO death_report_trusted_actions
			(id, death_report_id, contact_id, contact_email, contact_name, action,
			 token_hash, token_expires, created_at)
		VALUES
			(:id, :death_report_id, :contact_id, :contact_email, :contact_name, :action,
			 :token_hash, :token_expires, :created_at)`, a)
	return err
}

func (r *DeathReportRepo) GetTrustedActionByToken(ctx context.Context, tokenHash string) (*models.DeathReportTrustedAction, error) {
	var a models.DeathReportTrustedAction
	err := r.db.GetContext(ctx, &a, `
		SELECT * FROM death_report_trusted_actions
		WHERE token_hash = $1 AND used_at IS NULL AND token_expires > NOW()`, tokenHash)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &a, err
}

func (r *DeathReportRepo) MarkTrustedActionUsed(ctx context.Context, id string) error {
	now := time.Now()
	_, err := r.db.ExecContext(ctx, `UPDATE death_report_trusted_actions SET used_at = $1 WHERE id = $2`, now, id)
	return err
}

// GetCorroborationCount returns the number of used corroborate actions for a given report.
func (r *DeathReportRepo) GetCorroborationCount(ctx context.Context, deathReportID string) (int, error) {
	var count int
	err := r.db.GetContext(ctx, &count, `
		SELECT COUNT(*) FROM death_report_trusted_actions
		WHERE death_report_id = $1 AND action = 'corroborate' AND used_at IS NOT NULL`, deathReportID)
	return count, err
}
