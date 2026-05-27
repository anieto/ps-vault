package repository

import (
	"context"
	"database/sql"

	"github.com/jmoiron/sqlx"
	"github.com/ps-vault/ps-vault/internal/models"
)

type SwitchRepo struct {
	db *sqlx.DB
}

func (r *SwitchRepo) GetByUserID(ctx context.Context, userID string) (*models.SwitchSettings, error) {
	var s models.SwitchSettings
	err := r.db.GetContext(ctx, &s, `SELECT * FROM switch_settings WHERE user_id = $1`, userID)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &s, err
}

func (r *SwitchRepo) Create(ctx context.Context, s *models.SwitchSettings) error {
	_, err := r.db.NamedExecContext(ctx, `
		INSERT INTO switch_settings (
			id, user_id, is_active, check_in_interval_days, reminder1_days_before,
			reminder2_hours_before, final_warning_hours_before, abort_window_hours,
			death_report_response_hours, max_pause_days, status
		) VALUES (
			:id, :user_id, :is_active, :check_in_interval_days, :reminder1_days_before,
			:reminder2_hours_before, :final_warning_hours_before, :abort_window_hours,
			:death_report_response_hours, :max_pause_days, :status
		)`, s)
	return err
}

func (r *SwitchRepo) Update(ctx context.Context, s *models.SwitchSettings) error {
	_, err := r.db.NamedExecContext(ctx, `
		UPDATE switch_settings SET
			is_active = :is_active,
			check_in_interval_days = :check_in_interval_days,
			reminder1_days_before = :reminder1_days_before,
			reminder2_hours_before = :reminder2_hours_before,
			final_warning_hours_before = :final_warning_hours_before,
			abort_window_hours = :abort_window_hours,
			death_report_response_hours = :death_report_response_hours,
			max_pause_days = :max_pause_days,
			status = :status,
			last_checkin_at = :last_checkin_at,
			next_checkin_deadline = :next_checkin_deadline,
			paused_until = :paused_until,
			triggered_at = :triggered_at,
			abort_deadline = :abort_deadline,
			reminder1_sent_at = :reminder1_sent_at,
			reminder2_sent_at = :reminder2_sent_at,
			final_warning_sent_at = :final_warning_sent_at,
			updated_at = NOW()
		WHERE id = :id`, s)
	return err
}

func (r *SwitchRepo) SaveCheckin(ctx context.Context, c *models.SwitchCheckin) error {
	_, err := r.db.NamedExecContext(ctx, `
		INSERT INTO switch_checkins (id, user_id, method, ip_address)
		VALUES (:id, :user_id, :method, :ip_address)`, c)
	return err
}

func (r *SwitchRepo) GetCheckinHistory(ctx context.Context, userID string, limit int) ([]*models.SwitchCheckin, error) {
	var checkins []*models.SwitchCheckin
	err := r.db.SelectContext(ctx, &checkins, `
		SELECT * FROM switch_checkins
		WHERE user_id = $1
		ORDER BY created_at DESC
		LIMIT $2`, userID, limit)
	return checkins, err
}

// MarkReminder1Sent sets reminder1_sent_at to now for the given switch.
func (r *SwitchRepo) MarkReminder1Sent(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE switch_settings SET reminder1_sent_at = NOW(), updated_at = NOW() WHERE id = $1`, id)
	return err
}

// MarkReminder2Sent sets reminder2_sent_at to now for the given switch.
func (r *SwitchRepo) MarkReminder2Sent(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE switch_settings SET reminder2_sent_at = NOW(), updated_at = NOW() WHERE id = $1`, id)
	return err
}

// MarkFinalWarningSent sets final_warning_sent_at to now for the given switch.
func (r *SwitchRepo) MarkFinalWarningSent(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE switch_settings SET final_warning_sent_at = NOW(), updated_at = NOW() WHERE id = $1`, id)
	return err
}

// GetOverdueActive returns all active switches where the deadline has passed.
func (r *SwitchRepo) GetOverdueActive(ctx context.Context) ([]*models.SwitchSettings, error) {
	var switches []*models.SwitchSettings
	err := r.db.SelectContext(ctx, &switches, `
		SELECT * FROM switch_settings
		WHERE status = 'active'
		  AND next_checkin_deadline IS NOT NULL
		  AND next_checkin_deadline < NOW()`)
	return switches, err
}

// GetPendingReminders1 returns active switches where reminder1 should be sent.
func (r *SwitchRepo) GetPendingReminders1(ctx context.Context) ([]*models.SwitchSettings, error) {
	var switches []*models.SwitchSettings
	err := r.db.SelectContext(ctx, &switches, `
		SELECT * FROM switch_settings
		WHERE status = 'active'
		  AND next_checkin_deadline IS NOT NULL
		  AND next_checkin_deadline - (reminder1_days_before || ' days')::INTERVAL < NOW()
		  AND reminder1_sent_at IS NULL`)
	return switches, err
}

// GetPendingReminders2 returns active switches where reminder2 should be sent.
func (r *SwitchRepo) GetPendingReminders2(ctx context.Context) ([]*models.SwitchSettings, error) {
	var switches []*models.SwitchSettings
	err := r.db.SelectContext(ctx, &switches, `
		SELECT * FROM switch_settings
		WHERE status = 'active'
		  AND next_checkin_deadline IS NOT NULL
		  AND next_checkin_deadline - (reminder2_hours_before || ' hours')::INTERVAL < NOW()
		  AND reminder2_sent_at IS NULL`)
	return switches, err
}

// GetPendingFinalWarnings returns active switches where the final warning should be sent.
func (r *SwitchRepo) GetPendingFinalWarnings(ctx context.Context) ([]*models.SwitchSettings, error) {
	var switches []*models.SwitchSettings
	err := r.db.SelectContext(ctx, &switches, `
		SELECT * FROM switch_settings
		WHERE status = 'active'
		  AND next_checkin_deadline IS NOT NULL
		  AND next_checkin_deadline - (final_warning_hours_before || ' hours')::INTERVAL < NOW()
		  AND final_warning_sent_at IS NULL`)
	return switches, err
}

// GetTriggeredPastAbortWindow returns triggered switches where the abort window has expired.
func (r *SwitchRepo) GetTriggeredPastAbortWindow(ctx context.Context) ([]*models.SwitchSettings, error) {
	var switches []*models.SwitchSettings
	err := r.db.SelectContext(ctx, &switches, `
		SELECT * FROM switch_settings
		WHERE status = 'triggered'
		  AND abort_deadline IS NOT NULL
		  AND abort_deadline < NOW()`)
	return switches, err
}

func (r *SwitchRepo) SetEmailCheckinToken(ctx context.Context, userID, token string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE switch_settings SET
			email_checkin_token = $1,
			email_checkin_token_expires = NOW() + INTERVAL '24 hours',
			updated_at = NOW()
		WHERE user_id = $2`, token, userID)
	return err
}

func (r *SwitchRepo) GetByEmailCheckinToken(ctx context.Context, token string) (*models.SwitchSettings, error) {
	var s models.SwitchSettings
	err := r.db.GetContext(ctx, &s, `
		SELECT * FROM switch_settings
		WHERE email_checkin_token = $1
		  AND email_checkin_token_expires > NOW()`, token)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &s, err
}

func (r *SwitchRepo) ClearEmailCheckinToken(ctx context.Context, userID string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE switch_settings SET
			email_checkin_token = NULL,
			email_checkin_token_expires = NULL,
			updated_at = NOW()
		WHERE user_id = $1`, userID)
	return err
}

func (r *SwitchRepo) CountByStatus(ctx context.Context) (map[string]int, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT status, COUNT(*) FROM switch_settings GROUP BY status`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[string]int)
	for rows.Next() {
		var status string
		var count int
		if err := rows.Scan(&status, &count); err != nil {
			return nil, err
		}
		result[status] = count
	}
	return result, rows.Err()
}
