package services

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"log"
	"math"
	"time"

	"github.com/google/uuid"
	"github.com/ps-vault/ps-vault/internal/config"
	"github.com/ps-vault/ps-vault/internal/models"
	"github.com/ps-vault/ps-vault/internal/repository"
)

type SwitchService struct {
	cfg      *config.Config
	repos    *repository.Repos
	email    *EmailService
	push     *PushService
	delivery *DeliveryService
}

type UpdateSwitchInput struct {
	CheckInIntervalDays      *int
	Reminder1DaysBefore      *int
	Reminder2HoursBefore     *int
	FinalWarningHoursBefore  *int
	AbortWindowHours         *int
	DeathReportResponseHours *int
	MaxPauseDays             *int
	IsActive                 *bool
	PreferredCheckinHour     *int // 0–23, nil = clear preference
	ClearPreferredHour       bool
}

// formatTimeLeft returns a human-readable time-remaining string, mirroring the frontend
// formatDeadlineCountdown: hours+minutes when < 24 h, days otherwise.
func formatTimeLeft(d time.Duration) string {
	if d <= 0 {
		return "overdue"
	}
	if d < 24*time.Hour {
		h := int(d.Hours())
		m := int(d.Minutes()) % 60
		if h == 0 {
			return fmt.Sprintf("%dm", m)
		}
		if m == 0 {
			return fmt.Sprintf("%dh", h)
		}
		return fmt.Sprintf("%dh %dm", h, m)
	}
	days := int(math.Round(d.Hours() / 24))
	if days == 1 {
		return "1 day"
	}
	return fmt.Sprintf("%d days", days)
}

// computeDeadline returns now + intervalDays, snapped to the preferred hour of day if set.
func computeDeadline(now time.Time, intervalDays int, sw *models.SwitchSettings) time.Time {
	base := now.Add(time.Duration(intervalDays) * 24 * time.Hour)
	if !sw.PreferredCheckinHour.Valid {
		return base
	}
	h := int(sw.PreferredCheckinHour.Int32)
	return time.Date(base.Year(), base.Month(), base.Day(), h, 0, 0, 0, base.Location())
}

func (s *SwitchService) Get(ctx context.Context, userID string) (*models.SwitchSettings, error) {
	return s.repos.Switch.GetByUserID(ctx, userID)
}

func (s *SwitchService) Update(ctx context.Context, userID string, input UpdateSwitchInput) (*models.SwitchSettings, error) {
	sw, err := s.repos.Switch.GetByUserID(ctx, userID)
	if err != nil || sw == nil {
		return nil, fmt.Errorf("switch settings not found")
	}

	if input.PreferredCheckinHour != nil {
		sw.PreferredCheckinHour.Int32 = int32(*input.PreferredCheckinHour)
		sw.PreferredCheckinHour.Valid = true
	} else if input.ClearPreferredHour {
		sw.PreferredCheckinHour.Valid = false
	}

	if input.CheckInIntervalDays != nil && *input.CheckInIntervalDays != sw.CheckInIntervalDays {
		sw.CheckInIntervalDays = *input.CheckInIntervalDays
		// Recalculate the deadline based on the last check-in and new interval
		if sw.Status == "active" && sw.LastCheckinAt.Valid {
			sw.NextCheckinDeadline.Time = computeDeadline(sw.LastCheckinAt.Time, sw.CheckInIntervalDays, sw)
			sw.NextCheckinDeadline.Valid = true
		}
	}
	if input.Reminder1DaysBefore != nil {
		sw.Reminder1DaysBefore = *input.Reminder1DaysBefore
	}
	if input.Reminder2HoursBefore != nil {
		sw.Reminder2HoursBefore = *input.Reminder2HoursBefore
	}
	if input.FinalWarningHoursBefore != nil {
		sw.FinalWarningHoursBefore = *input.FinalWarningHoursBefore
	}
	if input.AbortWindowHours != nil {
		sw.AbortWindowHours = *input.AbortWindowHours
	}
	if input.DeathReportResponseHours != nil {
		sw.DeathReportResponseHours = *input.DeathReportResponseHours
	}
	if input.MaxPauseDays != nil {
		sw.MaxPauseDays = *input.MaxPauseDays
	}
	if input.IsActive != nil {
		wasActive := sw.IsActive
		sw.IsActive = *input.IsActive

		if *input.IsActive && !wasActive {
			// Activating — set first deadline
			now := time.Now()
			sw.Status = "active"
			sw.LastCheckinAt.Time = now
			sw.LastCheckinAt.Valid = true
			sw.NextCheckinDeadline.Time = computeDeadline(now, sw.CheckInIntervalDays, sw)
			sw.NextCheckinDeadline.Valid = true
			sw.Reminder1SentAt.Valid = false
			sw.Reminder2SentAt.Valid = false
			sw.FinalWarningSentAt.Valid = false
		} else if !*input.IsActive && wasActive {
			sw.Status = "inactive"
		}
	}

	if err := s.repos.Switch.Update(ctx, sw); err != nil {
		return nil, err
	}
	return sw, nil
}

func (s *SwitchService) CheckIn(ctx context.Context, userID, method, ip string) (*models.SwitchSettings, error) {
	sw, err := s.repos.Switch.GetByUserID(ctx, userID)
	if err != nil || sw == nil {
		return nil, fmt.Errorf("switch settings not found")
	}

	if sw.Status != "active" {
		return sw, nil
	}

	checkin := &models.SwitchCheckin{
		ID:        uuid.New().String(),
		UserID:    userID,
		Method:    method,
		IPAddress: ip,
	}
	s.repos.Switch.SaveCheckin(ctx, checkin)

	now := time.Now()
	sw.LastCheckinAt.Time = now
	sw.LastCheckinAt.Valid = true
	sw.NextCheckinDeadline.Time = computeDeadline(now, sw.CheckInIntervalDays, sw)
	sw.NextCheckinDeadline.Valid = true
	sw.Reminder1SentAt.Valid = false
	sw.Reminder2SentAt.Valid = false
	sw.FinalWarningSentAt.Valid = false

	if err := s.repos.Switch.Update(ctx, sw); err != nil {
		return nil, err
	}
	return sw, nil
}

func (s *SwitchService) Pause(ctx context.Context, userID string, resumeAt time.Time, reason string) (*models.SwitchSettings, error) {
	sw, err := s.repos.Switch.GetByUserID(ctx, userID)
	if err != nil || sw == nil {
		return nil, fmt.Errorf("switch settings not found")
	}

	if sw.Status == "triggered" {
		return nil, fmt.Errorf("cannot pause after switch has triggered")
	}

	maxResume := time.Now().Add(time.Duration(sw.MaxPauseDays) * 24 * time.Hour)
	if resumeAt.After(maxResume) {
		resumeAt = maxResume
	}

	sw.Status = "paused"
	sw.PausedUntil.Time = resumeAt
	sw.PausedUntil.Valid = true

	if err := s.repos.Switch.Update(ctx, sw); err != nil {
		return nil, err
	}
	return sw, nil
}

func (s *SwitchService) Resume(ctx context.Context, userID string) (*models.SwitchSettings, error) {
	sw, err := s.repos.Switch.GetByUserID(ctx, userID)
	if err != nil || sw == nil {
		return nil, fmt.Errorf("switch settings not found")
	}

	if sw.Status != "paused" {
		return sw, nil
	}

	now := time.Now()
	sw.Status = "active"
	sw.PausedUntil.Valid = false
	sw.LastCheckinAt.Time = now
	sw.LastCheckinAt.Valid = true
	sw.NextCheckinDeadline.Time = computeDeadline(now, sw.CheckInIntervalDays, sw)
	sw.NextCheckinDeadline.Valid = true
	sw.Reminder1SentAt.Valid = false
	sw.Reminder2SentAt.Valid = false
	sw.FinalWarningSentAt.Valid = false

	if err := s.repos.Switch.Update(ctx, sw); err != nil {
		return nil, err
	}
	return sw, nil
}

func (s *SwitchService) Abort(ctx context.Context, userID string) (*models.SwitchSettings, error) {
	sw, err := s.repos.Switch.GetByUserID(ctx, userID)
	if err != nil || sw == nil {
		return nil, fmt.Errorf("switch settings not found")
	}

	if sw.Status != "triggered" {
		return sw, nil
	}

	now := time.Now()
	sw.Status = "active"
	sw.TriggeredAt.Valid = false
	sw.AbortDeadline.Valid = false
	sw.LastCheckinAt.Time = now
	sw.LastCheckinAt.Valid = true
	sw.NextCheckinDeadline.Time = computeDeadline(now, sw.CheckInIntervalDays, sw)
	sw.NextCheckinDeadline.Valid = true
	sw.Reminder1SentAt.Valid = false
	sw.Reminder2SentAt.Valid = false
	sw.FinalWarningSentAt.Valid = false

	if err := s.repos.Switch.Update(ctx, sw); err != nil {
		return nil, err
	}

	// Notify user the trigger was aborted
	user, _ := s.repos.Users.GetByID(ctx, userID)
	if user != nil {
		s.email.SendAsync(ctx, user.Email, "trigger_aborted", map[string]string{
			"display_name": user.DisplayName,
			"app_name": resolveAppName(ctx, s.repos, s.cfg),
		})
	}

	return sw, nil
}

// AbortByToken aborts a triggered switch using a trusted contact's abort token.
func (s *SwitchService) AbortByToken(ctx context.Context, rawToken string) error {
	tokenHash := hashToken(rawToken)
	tc, err := s.repos.Beneficiaries.GetTrustedContactByAbortToken(ctx, tokenHash)
	if err != nil {
		return fmt.Errorf("internal error")
	}
	if tc == nil {
		return fmt.Errorf("invalid or expired abort link")
	}

	sw, err := s.repos.Switch.GetByUserID(ctx, tc.UserID)
	if err != nil || sw == nil {
		return fmt.Errorf("switch not found")
	}
	if sw.Status != "triggered" {
		return fmt.Errorf("switch is no longer in a triggered state")
	}
	if sw.AbortDeadline.Valid && time.Now().After(sw.AbortDeadline.Time) {
		return fmt.Errorf("the abort window has passed")
	}

	// Clear the token so it can't be reused
	s.repos.Beneficiaries.ClearAbortToken(ctx, tc.ID) //nolint:errcheck

	_, err = s.Abort(ctx, tc.UserID)
	return err
}

// RevokeDeliveries immediately invalidates all active delivery tokens for the user's vaults
// and resets the switch back to active so the user can continue using their vault normally.
func (s *SwitchService) RevokeDeliveries(ctx context.Context, userID string) (int64, error) {
	n, err := s.delivery.RevokeAll(ctx, userID)
	if err != nil {
		return 0, err
	}

	// Reset the switch to active so the user doesn't get stuck in triggered/delivered state.
	sw, err := s.repos.Switch.GetByUserID(ctx, userID)
	if err != nil || sw == nil {
		return n, nil // tokens revoked; best-effort on switch reset
	}

	now := time.Now()
	sw.Status = "active"
	sw.TriggeredAt.Valid = false
	sw.AbortDeadline.Valid = false
	sw.LastCheckinAt.Time = now
	sw.LastCheckinAt.Valid = true
	sw.NextCheckinDeadline.Time = computeDeadline(now, sw.CheckInIntervalDays, sw)
	sw.NextCheckinDeadline.Valid = true
	sw.Reminder1SentAt.Valid = false
	sw.Reminder2SentAt.Valid = false
	sw.FinalWarningSentAt.Valid = false

	_ = s.repos.Switch.Update(ctx, sw)
	return n, nil
}

func (s *SwitchService) History(ctx context.Context, userID string) ([]*models.SwitchCheckin, error) {
	return s.repos.Switch.GetCheckinHistory(ctx, userID, 50)
}

const schedulerHeartbeatKey = "_scheduler_heartbeat"

// RunChecker is a background goroutine that processes switch state every 5 minutes.
func (s *SwitchService) RunChecker(ctx context.Context) {
	log.Println("switch checker started")
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	// Run immediately on start
	s.runChecks(ctx)

	for {
		select {
		case <-ctx.Done():
			log.Println("switch checker stopped")
			return
		case <-ticker.C:
			s.runChecks(ctx)
		}
	}
}

func (s *SwitchService) runChecks(ctx context.Context) {
	now := time.Now().UTC()

	// Downtime detection: compare last heartbeat to now.
	s.checkDowntime(ctx, now)

	// Write heartbeat so the next run can detect gaps.
	_ = s.repos.SystemConfig.Set(ctx, schedulerHeartbeatKey, now.Format(time.RFC3339))

	s.resumePausedSwitches(ctx)
	s.sendReminders1(ctx)
	s.sendReminders2(ctx)
	s.sendFinalWarnings(ctx)
	s.triggerOverdue(ctx)
	s.deliverTriggered(ctx)
}

// checkDowntime reads the last heartbeat and, if the gap exceeds the configured
// threshold, sends grace notifications to any users whose deadline fell in the gap.
func (s *SwitchService) checkDowntime(ctx context.Context, now time.Time) {
	lastStr, err := s.repos.SystemConfig.Get(ctx, schedulerHeartbeatKey)
	if err != nil || lastStr == "" {
		// First run — no baseline yet, nothing to compare.
		return
	}

	lastRun, err := time.Parse(time.RFC3339, lastStr)
	if err != nil {
		return
	}

	// Determine threshold (admin-configurable, default 1 hour).
	thresholdHours := 1
	if v, err := s.repos.SystemConfig.Get(ctx, "downtime_grace_threshold_hours"); err == nil && v != "" {
		if n, err := fmt.Sscanf(v, "%d", &thresholdHours); n == 0 || err != nil {
			thresholdHours = 1
		}
	}
	threshold := time.Duration(thresholdHours) * time.Hour

	gap := now.Sub(lastRun)
	if gap <= threshold {
		return
	}

	log.Printf("downtime detected: server was offline for %s (threshold %s), applying grace period", gap.Round(time.Minute), threshold)

	// Find active switches whose deadline fell within the outage window.
	affected, err := s.repos.Switch.GetActiveWithDeadlineInRange(ctx, lastRun, now)
	if err != nil || len(affected) == 0 {
		return
	}

	appName := resolveAppName(ctx, s.repos, s.cfg)

	for _, sw := range affected {
		user, err := s.repos.Users.GetByID(ctx, sw.UserID)
		if err != nil || user == nil {
			continue
		}

		// Reset deadline: now + check-in interval.
		interval := time.Duration(sw.CheckInIntervalDays) * 24 * time.Hour
		newDeadline := now.Add(interval)

		// Align to preferred hour if set.
		if sw.PreferredCheckinHour.Valid {
			h := int(sw.PreferredCheckinHour.Int32)
			newDeadline = time.Date(newDeadline.Year(), newDeadline.Month(), newDeadline.Day(), h, 0, 0, 0, newDeadline.Location())
		}

		sw.NextCheckinDeadline.Time = newDeadline
		sw.NextCheckinDeadline.Valid = true
		// Clear reminder sent flags so reminders fire freshly on the new deadline.
		sw.Reminder1SentAt.Valid = false
		sw.Reminder2SentAt.Valid = false
		sw.FinalWarningSentAt.Valid = false

		if err := s.repos.Switch.Update(ctx, sw); err != nil {
			log.Printf("downtime grace: failed to update switch for user %s: %v", sw.UserID, err)
			continue
		}

		plural := "s"
		if sw.CheckInIntervalDays == 1 {
			plural = ""
		}
		s.email.SendAsync(ctx, user.Email, "checkin_grace", map[string]string{
			"app_name":      appName,
			"display_name":  user.DisplayName,
			"interval_days": fmt.Sprintf("%d", sw.CheckInIntervalDays),
			"interval_plural": plural,
			"dashboard_url": s.cfg.BaseURL + "/dashboard",
		})

		log.Printf("downtime grace: reset deadline for user %s, new deadline %s", user.Email, newDeadline.Format(time.RFC3339))
	}
}

func (s *SwitchService) resumePausedSwitches(ctx context.Context) {
	// Auto-resume switches where pause has expired
	rows, err := s.repos.Switch.GetByUserID(ctx, "")
	_ = rows
	if err != nil {
		return
	}
	// TODO: add a GetPausedExpired query — for now handled inline
}

func (s *SwitchService) generateEmailCheckinToken(ctx context.Context, userID string) string {
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		return ""
	}
	token := hex.EncodeToString(b)
	if err := s.repos.Switch.SetEmailCheckinToken(ctx, userID, token); err != nil {
		return ""
	}
	return token
}

func (s *SwitchService) sendReminders1(ctx context.Context) {
	switches, err := s.repos.Switch.GetPendingReminders1(ctx)
	if err != nil {
		return
	}
	for _, sw := range switches {
		user, err := s.repos.Users.GetByID(ctx, sw.UserID)
		if err != nil || user == nil {
			continue
		}
		timeLeft := formatTimeLeft(time.Until(sw.NextCheckinDeadline.Time))
		token := s.generateEmailCheckinToken(ctx, sw.UserID)
		checkinURL := fmt.Sprintf("%s/checkin?token=%s", s.cfg.BaseURL, token)
		s.email.SendAsync(ctx, user.Email, "checkin_reminder1", map[string]string{
			"display_name": user.DisplayName,
			"time_left":    timeLeft,
			"checkin_url":  checkinURL,
			"app_name": resolveAppName(ctx, s.repos, s.cfg),
		})
		s.push.SendToUser(ctx, sw.UserID,
			"Check-in reminder",
			fmt.Sprintf("Your vault check-in is due in %s. Tap to check in.", timeLeft),
			map[string]any{"type": "checkin_reminder", "deep_link": "psvault://checkin-confirm"},
		)
		if err := s.repos.Switch.MarkReminder1Sent(ctx, sw.ID); err != nil {
			log.Printf("failed to mark reminder1 sent for switch %s: %v", sw.ID, err)
		}
	}
}

// CheckInByEmailToken validates a single-use email check-in token and records a check-in.
func (s *SwitchService) CheckInByEmailToken(ctx context.Context, token, ipAddress string) error {
	sw, err := s.repos.Switch.GetByEmailCheckinToken(ctx, token)
	if err != nil || sw == nil {
		return fmt.Errorf("invalid or expired token")
	}

	// Clear the token so it can't be reused
	s.repos.Switch.ClearEmailCheckinToken(ctx, sw.UserID)

	// Record the check-in
	checkin := &models.SwitchCheckin{
		ID:        uuid.New().String(),
		UserID:    sw.UserID,
		Method:    "email",
		IPAddress: ipAddress,
	}
	if err := s.repos.Switch.SaveCheckin(ctx, checkin); err != nil {
		return err
	}

	// Reset the deadline
	now := time.Now()
	sw.LastCheckinAt.Time = now
	sw.LastCheckinAt.Valid = true
	sw.NextCheckinDeadline.Time = computeDeadline(now, sw.CheckInIntervalDays, sw)
	sw.NextCheckinDeadline.Valid = true
	sw.Reminder1SentAt.Valid = false
	sw.Reminder2SentAt.Valid = false
	sw.FinalWarningSentAt.Valid = false

	return s.repos.Switch.Update(ctx, sw)
}

func (s *SwitchService) sendReminders2(ctx context.Context) {
	switches, err := s.repos.Switch.GetPendingReminders2(ctx)
	if err != nil {
		return
	}
	for _, sw := range switches {
		user, err := s.repos.Users.GetByID(ctx, sw.UserID)
		if err != nil || user == nil {
			continue
		}
		hoursLeft := int(time.Until(sw.NextCheckinDeadline.Time).Hours())
		token := s.generateEmailCheckinToken(ctx, sw.UserID)
		checkinURL := fmt.Sprintf("%s/checkin?token=%s", s.cfg.BaseURL, token)
		s.email.SendAsync(ctx, user.Email, "checkin_reminder2", map[string]string{
			"display_name": user.DisplayName,
			"hours_left":   fmt.Sprintf("%d", hoursLeft),
			"checkin_url":  checkinURL,
			"app_name": resolveAppName(ctx, s.repos, s.cfg),
		})
		s.push.SendToUser(ctx, sw.UserID,
			"Check-in reminder",
			fmt.Sprintf("Your vault check-in is due in %d hours. Tap to check in now.", hoursLeft),
			map[string]any{"type": "checkin_reminder", "deep_link": "psvault://checkin-confirm"},
		)
		if err := s.repos.Switch.MarkReminder2Sent(ctx, sw.ID); err != nil {
			log.Printf("failed to mark reminder2 sent for switch %s: %v", sw.ID, err)
		}
	}
}

func (s *SwitchService) sendFinalWarnings(ctx context.Context) {
	switches, err := s.repos.Switch.GetPendingFinalWarnings(ctx)
	if err != nil {
		return
	}
	for _, sw := range switches {
		user, err := s.repos.Users.GetByID(ctx, sw.UserID)
		if err != nil || user == nil {
			continue
		}
		s.email.SendAsync(ctx, user.Email, "checkin_final_warning", map[string]string{
			"display_name": user.DisplayName,
			"checkin_url":  fmt.Sprintf("%s/dashboard", s.cfg.BaseURL),
			"app_name": resolveAppName(ctx, s.repos, s.cfg),
		})
		s.push.SendToUser(ctx, sw.UserID,
			"Final check-in warning",
			"Your switch is about to trigger. Check in now to prevent it.",
			map[string]any{"type": "checkin_reminder", "deep_link": "psvault://checkin-confirm"},
		)

		// Also notify trusted contacts with notify_on_final_warning = true
		contacts, _ := s.repos.Beneficiaries.GetTrustedContacts(ctx, sw.UserID)
		for _, tc := range contacts {
			if tc.NotifyOnFinalWarning {
				s.email.SendAsync(ctx, tc.Email, "trusted_contact_final_warning", map[string]string{
					"contact_name":  tc.Name,
					"owner_name":    user.DisplayName,
					"app_name": resolveAppName(ctx, s.repos, s.cfg),
				})
			}
		}

		if err := s.repos.Switch.MarkFinalWarningSent(ctx, sw.ID); err != nil {
			log.Printf("failed to mark final warning sent for switch %s: %v", sw.ID, err)
		}
	}
}

func (s *SwitchService) triggerOverdue(ctx context.Context) {
	switches, err := s.repos.Switch.GetOverdueActive(ctx)
	if err != nil {
		return
	}
	for _, sw := range switches {
		user, err := s.repos.Users.GetByID(ctx, sw.UserID)
		if err != nil || user == nil {
			continue
		}

		now := time.Now()
		abortDeadline := now.Add(time.Duration(sw.AbortWindowHours) * time.Hour)

		sw.Status = "triggered"
		sw.TriggeredAt.Time = now
		sw.TriggeredAt.Valid = true
		sw.AbortDeadline.Time = abortDeadline
		sw.AbortDeadline.Valid = true
		s.repos.Switch.Update(ctx, sw)

		// Notify owner with abort link
		abortURL := fmt.Sprintf("%s/dashboard?abort=true", s.cfg.BaseURL)
		s.email.SendAsync(ctx, user.Email, "switch_triggered", map[string]string{
			"display_name":   user.DisplayName,
			"abort_url":      abortURL,
			"abort_deadline": abortDeadline.Format("Monday, January 2 at 3:04 PM MST"),
			"app_name": resolveAppName(ctx, s.repos, s.cfg),
		})
		s.push.SendToUser(ctx, sw.UserID,
			"Your switch has triggered",
			fmt.Sprintf("Your vault will be delivered unless you abort by %s.", abortDeadline.Format("Jan 2 at 3:04 PM")),
			map[string]any{"type": "switch_triggered", "deep_link": "psvault://checkin-confirm"},
		)

		// Notify trusted contacts
		contacts, _ := s.repos.Beneficiaries.GetTrustedContacts(ctx, sw.UserID)
		appName := resolveAppName(ctx, s.repos, s.cfg)
		for _, tc := range contacts {
			vars := map[string]string{
				"contact_name": tc.Name,
				"owner_name":   user.DisplayName,
				"app_name":     appName,
				"abort_url":    "",
			}
			if tc.CanAbort {
				if rawToken, err := generateDeliveryToken(); err == nil {
					tokenHash := hashToken(rawToken)
					tc.AbortTokenHash = models.NullString{NullString: sql.NullString{String: tokenHash, Valid: true}}
					tc.AbortTokenExpires = models.NullTime{NullTime: sql.NullTime{Time: abortDeadline, Valid: true}}
					if saveErr := s.repos.Beneficiaries.UpdateTrustedContact(ctx, tc); saveErr == nil {
						vars["abort_url"] = fmt.Sprintf("%s/abort?token=%s", s.cfg.BaseURL, rawToken)
					}
				}
			}
			s.email.SendAsync(ctx, tc.Email, "trusted_contact_triggered", vars)
		}

		log.Printf("switch triggered for user %s, abort deadline: %s", sw.UserID, abortDeadline)
	}
}

func (s *SwitchService) deliverTriggered(ctx context.Context) {
	switches, err := s.repos.Switch.GetTriggeredPastAbortWindow(ctx)
	if err != nil {
		return
	}
	for _, sw := range switches {
		if err := s.delivery.DeliverVaults(ctx, sw.UserID); err != nil {
			log.Printf("delivery failed for user %s: %v", sw.UserID, err)
			continue
		}

		sw.Status = "delivered"
		s.repos.Switch.Update(ctx, sw)
		log.Printf("vaults delivered for user %s", sw.UserID)
	}
}
