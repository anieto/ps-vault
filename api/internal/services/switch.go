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
	cfg         *config.Config
	repos       *repository.Repos
	email       *EmailService
	push        *PushService
	delivery    *DeliveryService
	deathReport *DeathReportService
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
	PreferredCheckinHour     *int    // 0–23, nil = clear preference
	ClearPreferredHour       bool
	Timezone                 *string // IANA timezone string, e.g. "America/New_York"
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

// computeDeadline returns now + intervalDays, snapped to the preferred hour of day (in loc) if set.
func computeDeadline(now time.Time, intervalDays int, sw *models.SwitchSettings, loc *time.Location) time.Time {
	base := now.Add(time.Duration(intervalDays) * 24 * time.Hour)
	if !sw.PreferredCheckinHour.Valid {
		return base
	}
	if loc == nil {
		loc = time.UTC
	}
	h := int(sw.PreferredCheckinHour.Int32)
	baseLocal := base.In(loc)
	return time.Date(baseLocal.Year(), baseLocal.Month(), baseLocal.Day(), h, 0, 0, 0, loc)
}

// locFromUser returns the time.Location for a user's stored timezone, falling back to UTC.
func locFromUser(user *models.User) *time.Location {
	if user == nil || user.Timezone == "" {
		return time.UTC
	}
	loc, err := time.LoadLocation(user.Timezone)
	if err != nil {
		return time.UTC
	}
	return loc
}

// userLocation fetches the user and returns their time.Location, falling back to UTC.
func (s *SwitchService) userLocation(ctx context.Context, userID string) *time.Location {
	user, _ := s.repos.Users.GetByID(ctx, userID)
	return locFromUser(user)
}

func (s *SwitchService) Get(ctx context.Context, userID string) (*models.SwitchSettings, error) {
	return s.repos.Switch.GetByUserID(ctx, userID)
}

func (s *SwitchService) Update(ctx context.Context, userID string, input UpdateSwitchInput) (*models.SwitchSettings, error) {
	sw, err := s.repos.Switch.GetByUserID(ctx, userID)
	if err != nil || sw == nil {
		return nil, fmt.Errorf("switch settings not found")
	}

	preferredHourChanged := false
	if input.PreferredCheckinHour != nil {
		sw.PreferredCheckinHour.Int32 = int32(*input.PreferredCheckinHour)
		sw.PreferredCheckinHour.Valid = true
		preferredHourChanged = true
	} else if input.ClearPreferredHour {
		sw.PreferredCheckinHour.Valid = false
		preferredHourChanged = true
	}

	// Update the user's timezone if provided (used for preferred hour snapping).
	if input.Timezone != nil && *input.Timezone != "" {
		if _, err := time.LoadLocation(*input.Timezone); err == nil {
			if user, err2 := s.repos.Users.GetByID(ctx, userID); err2 == nil && user != nil {
				user.Timezone = *input.Timezone
				s.repos.Users.Update(ctx, user) //nolint:errcheck
			}
		}
	}

	loc := s.userLocation(ctx, userID)

	// Re-snap the current deadline when preferred hour changes on an active switch.
	if preferredHourChanged && sw.Status == "active" && sw.LastCheckinAt.Valid {
		sw.NextCheckinDeadline.Time = computeDeadline(sw.LastCheckinAt.Time, sw.CheckInIntervalDays, sw, loc)
		sw.NextCheckinDeadline.Valid = true
	}

	if input.CheckInIntervalDays != nil && *input.CheckInIntervalDays != sw.CheckInIntervalDays {
		sw.CheckInIntervalDays = *input.CheckInIntervalDays
		// Recalculate the deadline based on the last check-in and new interval
		if sw.Status == "active" && sw.LastCheckinAt.Valid {
			sw.NextCheckinDeadline.Time = computeDeadline(sw.LastCheckinAt.Time, sw.CheckInIntervalDays, sw, loc)
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
			sw.NextCheckinDeadline.Time = computeDeadline(now, sw.CheckInIntervalDays, sw, loc)
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
	sw.NextCheckinDeadline.Time = computeDeadline(now, sw.CheckInIntervalDays, sw, s.userLocation(ctx, userID))
	sw.NextCheckinDeadline.Valid = true
	sw.Reminder1SentAt.Valid = false
	sw.Reminder2SentAt.Valid = false
	sw.FinalWarningSentAt.Valid = false

	if err := s.repos.Switch.Update(ctx, sw); err != nil {
		return nil, err
	}

	// Dismiss any pending death report — a check-in is proof of life.
	if s.deathReport != nil {
		if dr, err := s.repos.DeathReports.GetActiveForOwner(ctx, userID); err == nil && dr != nil {
			s.repos.DeathReports.Dismiss(ctx, dr.ID) //nolint:errcheck
			appName := resolveAppName(ctx, s.repos, s.cfg)

			// Notify the reporter that the owner is alive.
			s.email.SendAsync(ctx, dr.ReporterEmail, "death_report_dismissed", map[string]string{
				"app_name": appName,
			})

			// Notify the owner that the report was cleared by their check-in.
			if owner, err := s.repos.Users.GetByID(ctx, userID); err == nil && owner != nil {
				reporterName := dr.ReporterEmail
				if dr.BeneficiaryID.Valid {
					if b, err := s.repos.Beneficiaries.GetByID(ctx, dr.BeneficiaryID.String); err == nil && b != nil {
						reporterName = b.Name
					}
				}
				s.email.SendAsync(ctx, owner.Email, "death_report_cleared", map[string]string{
					"display_name":  owner.DisplayName,
					"reporter_name": reporterName,
					"app_name":      appName,
				})
				s.push.SendToUser(ctx, userID,
					"Death report cleared",
					fmt.Sprintf("A report filed by %s was cleared because you checked in.", reporterName),
					map[string]any{"type": "death_report_cleared"},
				)
			}
		}
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
	sw.NextCheckinDeadline.Time = computeDeadline(now, sw.CheckInIntervalDays, sw, s.userLocation(ctx, userID))
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

	user, _ := s.repos.Users.GetByID(ctx, userID)
	now := time.Now()
	sw.Status = "active"
	sw.TriggeredAt.Valid = false
	sw.AbortDeadline.Valid = false
	sw.LastCheckinAt.Time = now
	sw.LastCheckinAt.Valid = true
	sw.NextCheckinDeadline.Time = computeDeadline(now, sw.CheckInIntervalDays, sw, locFromUser(user))
	sw.NextCheckinDeadline.Valid = true
	sw.Reminder1SentAt.Valid = false
	sw.Reminder2SentAt.Valid = false
	sw.FinalWarningSentAt.Valid = false

	if err := s.repos.Switch.Update(ctx, sw); err != nil {
		return nil, err
	}

	// Notify user the trigger was aborted
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
	sw.NextCheckinDeadline.Time = computeDeadline(now, sw.CheckInIntervalDays, sw, s.userLocation(ctx, userID))
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

// RunTest dry-runs the full switch notification cycle for the owner only.
// It uses the same operations as the real scheduler (formatTimeLeft,
// generateEmailCheckinToken, push.SendToUser) but sends to the owner only
// via [TEST]-prefixed templates and writes no state to the database.
func (s *SwitchService) RunTest(ctx context.Context, userID string) error {
	user, err := s.repos.Users.GetByID(ctx, userID)
	if err != nil || user == nil {
		return fmt.Errorf("user not found")
	}

	sw, err := s.repos.Switch.GetByUserID(ctx, userID)
	if err != nil || sw == nil {
		return fmt.Errorf("switch settings not found")
	}

	appName := resolveAppName(ctx, s.repos, s.cfg)
	now := time.Now()

	// Generate a real one-click check-in token — same as the real scheduler.
	// The link in the reminder emails will actually work.
	token := s.generateEmailCheckinToken(ctx, userID)
	checkinURL := fmt.Sprintf("%s/checkin?token=%s", s.cfg.BaseURL, token)

	// Stage 1: Reminder 1 — fires when deadline is reminder1_days_before away.
	timeLeft1 := formatTimeLeft(time.Duration(sw.Reminder1DaysBefore) * 24 * time.Hour)
	s.email.SendAsync(ctx, user.Email, "test_checkin_reminder1", map[string]string{
		"display_name": user.DisplayName,
		"time_left":    timeLeft1,
		"checkin_url":  checkinURL,
		"app_name":     appName,
	})
	s.push.SendToUser(ctx, userID,
		"[TEST] Check-in reminder",
		fmt.Sprintf("Your vault check-in is due in %s. Tap to check in.", timeLeft1),
		map[string]any{"type": "checkin_reminder", "deep_link": "psvault://checkin-confirm"},
	)

	// Stage 2: Reminder 2 — fires when deadline is reminder2_hours_before away.
	timeLeft2 := formatTimeLeft(time.Duration(sw.Reminder2HoursBefore) * time.Hour)
	s.email.SendAsync(ctx, user.Email, "test_checkin_reminder2", map[string]string{
		"display_name": user.DisplayName,
		"hours_left":   fmt.Sprintf("%d", sw.Reminder2HoursBefore),
		"checkin_url":  checkinURL,
		"app_name":     appName,
	})
	s.push.SendToUser(ctx, userID,
		"[TEST] Check-in reminder",
		fmt.Sprintf("Your vault check-in is due in %s. Tap to check in now.", timeLeft2),
		map[string]any{"type": "checkin_reminder", "deep_link": "psvault://checkin-confirm"},
	)

	// Stage 3: Final warning — fires when deadline is final_warning_hours_before away.
	s.email.SendAsync(ctx, user.Email, "test_checkin_final_warning", map[string]string{
		"display_name": user.DisplayName,
		"checkin_url":  s.cfg.BaseURL + "/dashboard",
		"app_name":     appName,
	})
	s.push.SendToUser(ctx, userID,
		"[TEST] Final check-in warning",
		"Your switch is about to trigger. Check in now to prevent it.",
		map[string]any{"type": "checkin_reminder", "deep_link": "psvault://checkin-confirm"},
	)

	// Stage 4: Trigger — fires when the deadline passes with no check-in.
	fakeAbortDeadline := now.Add(time.Duration(sw.AbortWindowHours) * time.Hour)
	abortURL := s.cfg.BaseURL + "/dashboard?abort=true"
	s.email.SendAsync(ctx, user.Email, "test_switch_triggered", map[string]string{
		"display_name":   user.DisplayName,
		"abort_url":      abortURL,
		"abort_deadline": fakeAbortDeadline.Format("Monday, January 2 at 3:04 PM MST"),
		"app_name":       appName,
	})
	s.push.SendToUser(ctx, userID,
		"[TEST] Your switch has triggered",
		fmt.Sprintf("Your vault will be delivered unless you abort by %s.", fakeAbortDeadline.Format("Jan 2 at 3:04 PM")),
		map[string]any{"type": "switch_triggered", "deep_link": "psvault://checkin-confirm"},
	)

	// Stage 5: Abort — fires when the owner cancels delivery within the abort window.
	s.email.SendAsync(ctx, user.Email, "test_trigger_aborted", map[string]string{
		"display_name": user.DisplayName,
		"app_name":     appName,
	})

	_ = s.repos.AuditLog.Log(ctx, &models.AuditLog{
		ID:        uuid.New().String(),
		UserID:    userID,
		EventType: "switch_test_run",
		EventData: `{}`,
	})

	return nil
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
	if s.deathReport != nil {
		s.deathReport.CheckPending(ctx)
	}
	s.notifyExpiringMobileSessions(ctx)
}

// notifyExpiringMobileSessions sends a push notification to users whose mobile sessions
// will expire within 3 days, prompting them to open the app and stay signed in.
func (s *SwitchService) notifyExpiringMobileSessions(ctx context.Context) {
	cutoff := time.Now().Add(3 * 24 * time.Hour)
	sessions, err := s.repos.Sessions.FindExpiringMobileSessions(ctx, cutoff)
	if err != nil {
		log.Printf("session expiry checker: query error: %v", err)
		return
	}
	for _, sess := range sessions {
		s.push.SendToUser(ctx, sess.UserID,
			"Session expiring soon",
			"Open P.S. Vault to stay signed in.",
			map[string]any{"type": "session_expiry"},
		)
		if err := s.repos.Sessions.MarkExpiryNotified(ctx, sess.ID); err != nil {
			log.Printf("session expiry checker: mark notified error for session %s: %v", sess.ID, err)
		}
	}
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

		newDeadline := computeDeadline(now, sw.CheckInIntervalDays, sw, locFromUser(user))

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
	// TODO: implement GetPausedExpired query to auto-resume paused switches
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
	sw.NextCheckinDeadline.Time = computeDeadline(now, sw.CheckInIntervalDays, sw, s.userLocation(ctx, sw.UserID))
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
		if err := s.repos.Switch.Update(ctx, sw); err != nil {
			log.Printf("failed to mark switch delivered for user %s: %v", sw.UserID, err)
			continue
		}
		log.Printf("vaults delivered for user %s", sw.UserID)
	}
}
