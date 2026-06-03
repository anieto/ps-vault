package services

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/ps-vault/ps-vault/internal/config"
	"github.com/ps-vault/ps-vault/internal/models"
	"github.com/ps-vault/ps-vault/internal/repository"
)

type DeathReportService struct {
	cfg   *config.Config
	repos *repository.Repos
	email *EmailService
	push  *PushService
}

func hashDeathToken(raw string) string {
	h := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(h[:])
}

// Initiate looks up beneficiaries matching the email and sends a magic link for each owner.
// Always returns nil to prevent email enumeration.
func (s *DeathReportService) Initiate(ctx context.Context, reporterEmail string) error {
	bens, err := s.repos.Beneficiaries.GetByEmail(ctx, reporterEmail)
	if err != nil || len(bens) == 0 {
		return nil
	}

	appName := resolveAppName(ctx, s.repos, s.cfg)

	for _, b := range bens {
		owner, err := s.repos.Users.GetByID(ctx, b.UserID)
		if err != nil || owner == nil {
			continue
		}

		raw, err := generateDeliveryToken()
		if err != nil {
			continue
		}

		t := &models.DeathReportToken{
			ID:            uuid.New().String(),
			TokenHash:     hashDeathToken(raw),
			ReporterEmail: reporterEmail,
			OwnerID:       b.UserID,
			BeneficiaryID: models.NullString{NullString: sql.NullString{String: b.ID, Valid: true}},
			ExpiresAt:     time.Now().Add(30 * time.Minute),
			CreatedAt:     time.Now(),
		}
		if err := s.repos.DeathReports.CreateToken(ctx, t); err != nil {
			continue
		}

		link := fmt.Sprintf("%s/report?token=%s", s.cfg.BaseURL, raw)
		s.email.SendAsync(ctx, reporterEmail, "death_report_magic_link", map[string]string{
			"owner_name": owner.DisplayName,
			"link":       link,
			"app_name":   appName,
		})
	}
	return nil
}

// ValidateToken checks the token and returns the owner's display name if valid.
func (s *DeathReportService) ValidateToken(ctx context.Context, rawToken string) (ownerName string, ownerID string, err error) {
	t, err := s.repos.DeathReports.GetTokenByHash(ctx, hashDeathToken(rawToken))
	if err != nil || t == nil {
		return "", "", fmt.Errorf("invalid or expired link")
	}
	owner, err := s.repos.Users.GetByID(ctx, t.OwnerID)
	if err != nil || owner == nil {
		return "", "", fmt.Errorf("invalid or expired link")
	}
	return owner.DisplayName, t.OwnerID, nil
}

type SubmitInput struct {
	Token         string
	DateOfPassing string
	Notes         string
}

// Submit creates a death report and sends urgent notifications to the owner.
func (s *DeathReportService) Submit(ctx context.Context, input SubmitInput) error {
	t, err := s.repos.DeathReports.GetTokenByHash(ctx, hashDeathToken(input.Token))
	if err != nil || t == nil {
		return fmt.Errorf("invalid or expired link")
	}

	// Prevent duplicate reports
	exists, _ := s.repos.DeathReports.HasActiveReport(ctx, t.ReporterEmail, t.OwnerID)
	if exists {
		return fmt.Errorf("a report is already pending for this owner")
	}

	owner, err := s.repos.Users.GetByID(ctx, t.OwnerID)
	if err != nil || owner == nil {
		return fmt.Errorf("owner not found")
	}

	sw, _ := s.repos.Switch.GetByUserID(ctx, t.OwnerID)
	responseHours := 24
	if sw != nil && sw.DeathReportResponseHours > 0 {
		responseHours = sw.DeathReportResponseHours
	}

	// Mark token used
	s.repos.DeathReports.MarkTokenUsed(ctx, t.ID) //nolint:errcheck

	now := time.Now()
	deadline := now.Add(time.Duration(responseHours) * time.Hour)

	// Generate owner verify-life token
	rawVerify, err := generateDeliveryToken()
	if err != nil {
		return fmt.Errorf("internal error")
	}
	verifyTokenHash := hashDeathToken(rawVerify)
	verifyURL := fmt.Sprintf("%s/report/verify?token=%s", s.cfg.BaseURL, rawVerify)

	dr := &models.DeathReport{
		ID:               uuid.New().String(),
		ReporterEmail:    t.ReporterEmail,
		OwnerID:          t.OwnerID,
		BeneficiaryID:    t.BeneficiaryID,
		Status:           "pending",
		ResponseDeadline: deadline,
		VerifyTokenHash:  models.NullString{NullString: sql.NullString{String: verifyTokenHash, Valid: true}},
		VerifyTokenExpires: models.NullTime{NullTime: sql.NullTime{Time: deadline, Valid: true}},
		CreatedAt:        now,
	}
	if input.DateOfPassing != "" {
		dr.DateOfPassing = models.NullString{NullString: sql.NullString{String: input.DateOfPassing, Valid: true}}
	}
	if input.Notes != "" {
		dr.Notes = models.NullString{NullString: sql.NullString{String: input.Notes, Valid: true}}
	}

	if err := s.repos.DeathReports.Create(ctx, dr); err != nil {
		return fmt.Errorf("internal error")
	}

	appName := resolveAppName(ctx, s.repos, s.cfg)

	// Get reporter's name from beneficiary record if available
	reporterName := t.ReporterEmail
	if t.BeneficiaryID.Valid {
		if b, err := s.repos.Beneficiaries.GetByID(ctx, t.BeneficiaryID.String); err == nil && b != nil {
			reporterName = b.Name
		}
	}

	// Urgent email to owner
	s.email.SendAsync(ctx, owner.Email, "death_report_owner", map[string]string{
		"display_name":      owner.DisplayName,
		"reporter_name":     reporterName,
		"verify_url":        verifyURL,
		"response_deadline": deadline.Format("Monday, January 2 at 3:04 PM MST"),
		"app_name":          appName,
	})

	// Urgent push to owner
	s.push.SendToUser(ctx, t.OwnerID,
		"Someone has reported your passing",
		fmt.Sprintf("%s has submitted a report. Tap to confirm you're okay.", reporterName),
		map[string]any{
			"type":      "death_report",
			"report_id": dr.ID,
			"deep_link": "psvault://death-report",
			"aps":       map[string]any{"sound": "critical.caf", "interruption-level": "critical"},
		},
	)

	// Notify trusted contacts who can verify life or corroborate death
	if contacts, err := s.repos.Beneficiaries.GetTrustedContacts(ctx, t.OwnerID); err == nil {
		for _, contact := range contacts {
			if !contact.CanVerifyLife && !contact.CanCorroborateDeath {
				continue
			}
			action := "corroborate"
			if contact.CanVerifyLife {
				action = "verify_life"
			}
			rawToken, err := generateDeliveryToken()
			if err != nil {
				continue
			}
			ta := &models.DeathReportTrustedAction{
				ID:            uuid.New().String(),
				DeathReportID: dr.ID,
				ContactID:     contact.ID,
				ContactEmail:  contact.Email,
				ContactName:   contact.Name,
				Action:        action,
				TokenHash:     hashDeathToken(rawToken),
				TokenExpires:  deadline,
				CreatedAt:     now,
			}
			if err := s.repos.DeathReports.CreateTrustedAction(ctx, ta); err != nil {
				log.Printf("failed to create trusted action for contact %s: %v", contact.ID, err)
				continue
			}
			deadlineStr := deadline.Format("Monday, January 2 at 3:04 PM MST")
			if action == "verify_life" {
				actionURL := fmt.Sprintf("%s/report/trusted-verify?token=%s", s.cfg.BaseURL, rawToken)
				s.email.SendAsync(ctx, contact.Email, "death_report_trusted_verify", map[string]string{
					"contact_name":  contact.Name,
					"owner_name":    owner.DisplayName,
					"reporter_name": reporterName,
					"action_url":    actionURL,
					"deadline":      deadlineStr,
					"app_name":      appName,
				})
			} else {
				actionURL := fmt.Sprintf("%s/report/trusted-corroborate?token=%s", s.cfg.BaseURL, rawToken)
				s.email.SendAsync(ctx, contact.Email, "death_report_trusted_corroborate", map[string]string{
					"contact_name":  contact.Name,
					"owner_name":    owner.DisplayName,
					"reporter_name": reporterName,
					"action_url":    actionURL,
					"deadline":      deadlineStr,
					"app_name":      appName,
				})
			}
		}
	}

	log.Printf("death report submitted for owner %s by %s, deadline %s", t.OwnerID, t.ReporterEmail, deadline)
	return nil
}

// VerifyLife dismisses a pending death report via the owner's token.
func (s *DeathReportService) VerifyLife(ctx context.Context, rawToken string) error {
	dr, err := s.repos.DeathReports.GetByVerifyToken(ctx, hashDeathToken(rawToken))
	if err != nil || dr == nil {
		return fmt.Errorf("invalid or expired link")
	}

	if err := s.repos.DeathReports.Dismiss(ctx, dr.ID); err != nil {
		return fmt.Errorf("internal error")
	}

	// Reset owner's check-in clock
	if sw, err := s.repos.Switch.GetByUserID(ctx, dr.OwnerID); err == nil && sw != nil && sw.Status == "active" {
		sw.LastCheckinAt = models.NullTime{NullTime: sql.NullTime{Time: time.Now(), Valid: true}}
		deadline := time.Now().Add(time.Duration(sw.CheckInIntervalDays) * 24 * time.Hour)
		sw.NextCheckinDeadline = models.NullTime{NullTime: sql.NullTime{Time: deadline, Valid: true}}
		sw.Reminder1SentAt = models.NullTime{}
		sw.Reminder2SentAt = models.NullTime{}
		sw.FinalWarningSentAt = models.NullTime{}
		s.repos.Switch.Update(ctx, sw) //nolint:errcheck
	}

	// Notify reporter
	appName := resolveAppName(ctx, s.repos, s.cfg)
	s.email.SendAsync(ctx, dr.ReporterEmail, "death_report_dismissed", map[string]string{
		"app_name": appName,
	})

	log.Printf("death report %s dismissed by owner %s", dr.ID, dr.OwnerID)
	return nil
}

// TrustedVerifyLife lets a trusted contact (with can_verify_life) dismiss a pending death report.
// Identical effect to the owner's VerifyLife, but via the trusted contact's token.
func (s *DeathReportService) TrustedVerifyLife(ctx context.Context, rawToken string) error {
	ta, err := s.repos.DeathReports.GetTrustedActionByToken(ctx, hashDeathToken(rawToken))
	if err != nil || ta == nil {
		return fmt.Errorf("invalid or expired link")
	}
	if ta.Action != "verify_life" {
		return fmt.Errorf("invalid token type")
	}
	dr, err := s.repos.DeathReports.GetByID(ctx, ta.DeathReportID)
	if err != nil || dr == nil || dr.Status != "pending" {
		return fmt.Errorf("this report is no longer active")
	}
	s.repos.DeathReports.MarkTrustedActionUsed(ctx, ta.ID) //nolint:errcheck
	if err := s.repos.DeathReports.Dismiss(ctx, dr.ID); err != nil {
		return fmt.Errorf("internal error")
	}
	// Reset owner's check-in clock
	if sw, err := s.repos.Switch.GetByUserID(ctx, dr.OwnerID); err == nil && sw != nil && sw.Status == "active" {
		sw.LastCheckinAt = models.NullTime{NullTime: sql.NullTime{Time: time.Now(), Valid: true}}
		deadline := time.Now().Add(time.Duration(sw.CheckInIntervalDays) * 24 * time.Hour)
		sw.NextCheckinDeadline = models.NullTime{NullTime: sql.NullTime{Time: deadline, Valid: true}}
		sw.Reminder1SentAt = models.NullTime{}
		sw.Reminder2SentAt = models.NullTime{}
		sw.FinalWarningSentAt = models.NullTime{}
		s.repos.Switch.Update(ctx, sw) //nolint:errcheck
	}
	appName := resolveAppName(ctx, s.repos, s.cfg)
	// Notify reporter
	s.email.SendAsync(ctx, dr.ReporterEmail, "death_report_dismissed", map[string]string{"app_name": appName})
	// Notify owner that a trusted contact cleared the report
	if owner, err := s.repos.Users.GetByID(ctx, dr.OwnerID); err == nil && owner != nil {
		s.email.SendAsync(ctx, owner.Email, "death_report_trusted_cleared", map[string]string{
			"display_name": owner.DisplayName,
			"contact_name": ta.ContactName,
			"app_name":     appName,
		})
	}
	log.Printf("death report %s dismissed by trusted contact %s", dr.ID, ta.ContactEmail)
	return nil
}

// TrustedCorroborate lets a trusted contact (with can_corroborate_death) confirm a pending report.
// The first corroboration shortens the owner's response window to 12 hours from now.
// Conflict-of-interest rule: the reporter cannot corroborate their own report.
func (s *DeathReportService) TrustedCorroborate(ctx context.Context, rawToken string) error {
	ta, err := s.repos.DeathReports.GetTrustedActionByToken(ctx, hashDeathToken(rawToken))
	if err != nil || ta == nil {
		return fmt.Errorf("invalid or expired link")
	}
	if ta.Action != "corroborate" {
		return fmt.Errorf("invalid token type")
	}
	dr, err := s.repos.DeathReports.GetByID(ctx, ta.DeathReportID)
	if err != nil || dr == nil || dr.Status != "pending" {
		return fmt.Errorf("this report is no longer active")
	}
	// Conflict-of-interest: reporter cannot corroborate their own report
	if strings.EqualFold(ta.ContactEmail, dr.ReporterEmail) {
		return fmt.Errorf("you cannot corroborate a report that you submitted")
	}
	count, _ := s.repos.DeathReports.GetCorroborationCount(ctx, ta.DeathReportID)
	s.repos.DeathReports.MarkTrustedActionUsed(ctx, ta.ID) //nolint:errcheck
	// First corroboration shortens the deadline to 12h from now (if that's sooner)
	if count == 0 {
		s.repos.DeathReports.ShortenDeadline(ctx, dr.ID, time.Now().Add(12*time.Hour)) //nolint:errcheck
	}
	appName := resolveAppName(ctx, s.repos, s.cfg)
	// Notify owner of corroboration
	if owner, err := s.repos.Users.GetByID(ctx, dr.OwnerID); err == nil && owner != nil {
		s.email.SendAsync(ctx, owner.Email, "death_report_corroborated", map[string]string{
			"display_name": owner.DisplayName,
			"contact_name": ta.ContactName,
			"app_name":     appName,
		})
	}
	log.Printf("death report %s corroborated by trusted contact %s (total corroborations: %d)", dr.ID, ta.ContactEmail, count+1)
	return nil
}

// ActiveDeathReport is the enriched response for the owner's active death report.
type ActiveDeathReport struct {
	*models.DeathReport
	ReporterName string `json:"reporter_name"`
}

// GetActive returns the active (pending) death report for a given owner, if any,
// enriched with the reporter's name from their beneficiary record.
func (s *DeathReportService) GetActive(ctx context.Context, ownerID string) (*ActiveDeathReport, error) {
	dr, err := s.repos.DeathReports.GetActiveForOwner(ctx, ownerID)
	if err != nil || dr == nil {
		return nil, err
	}
	name := dr.ReporterEmail
	if dr.BeneficiaryID.Valid {
		if b, err := s.repos.Beneficiaries.GetByID(ctx, dr.BeneficiaryID.String); err == nil && b != nil {
			name = b.Name
		}
	}
	return &ActiveDeathReport{DeathReport: dr, ReporterName: name}, nil
}

// CheckPending is called by the scheduler to process halfway alerts and deadline-triggered reports.
func (s *DeathReportService) CheckPending(ctx context.Context) {
	s.sendHalfwayAlerts(ctx)
	s.triggerExpired(ctx)
}

func (s *DeathReportService) sendHalfwayAlerts(ctx context.Context) {
	reports, err := s.repos.DeathReports.GetPendingPastHalfway(ctx)
	if err != nil {
		return
	}
	appName := resolveAppName(ctx, s.repos, s.cfg)
	for _, dr := range reports {
		owner, err := s.repos.Users.GetByID(ctx, dr.OwnerID)
		if err != nil || owner == nil {
			continue
		}

		// Resolve reporter's display name.
		reporterName := dr.ReporterEmail
		if dr.BeneficiaryID.Valid {
			if b, err := s.repos.Beneficiaries.GetByID(ctx, dr.BeneficiaryID.String); err == nil && b != nil {
				reporterName = b.Name
			}
		}

		// Issue a fresh verify token so the email button actually works.
		verifyURL := fmt.Sprintf("%s/dashboard", s.cfg.BaseURL)
		if rawVerify, err := generateDeliveryToken(); err == nil {
			newHash := hashDeathToken(rawVerify)
			if err := s.repos.DeathReports.SetVerifyToken(ctx, dr.ID, newHash, dr.ResponseDeadline); err == nil {
				verifyURL = fmt.Sprintf("%s/report/verify?token=%s", s.cfg.BaseURL, rawVerify)
			}
		}

		s.email.SendAsync(ctx, owner.Email, "death_report_owner", map[string]string{
			"display_name":      owner.DisplayName,
			"reporter_name":     reporterName,
			"verify_url":        verifyURL,
			"response_deadline": dr.ResponseDeadline.Format("Monday, January 2 at 3:04 PM MST"),
			"app_name":          appName,
		})
		s.push.SendToUser(ctx, dr.OwnerID,
			"Reminder: someone has reported your passing",
			fmt.Sprintf("You have until %s to respond.", dr.ResponseDeadline.Format("Jan 2 at 3:04 PM")),
			map[string]any{
				"type":      "death_report_reminder",
				"report_id": dr.ID,
				"deep_link": "psvault://death-report",
				"aps":       map[string]any{"sound": "critical.caf", "interruption-level": "critical"},
			},
		)
		s.repos.DeathReports.MarkHalfwaySent(ctx, dr.ID) //nolint:errcheck
	}
}

func (s *DeathReportService) triggerExpired(ctx context.Context) {
	reports, err := s.repos.DeathReports.GetPendingPastDeadline(ctx)
	if err != nil {
		return
	}
	for _, dr := range reports {
		sw, err := s.repos.Switch.GetByUserID(ctx, dr.OwnerID)
		if err != nil || sw == nil {
			s.repos.DeathReports.MarkTriggered(ctx, dr.ID) //nolint:errcheck
			continue
		}
		// Only trigger for vaults assigned to this beneficiary if beneficiary_id is set.
		// For Phase 7, we trigger the whole switch (same as normal overdue trigger).
		// Phase 8 can scope to specific vault assignments.
		now := time.Now()
		abortDeadline := now.Add(time.Duration(sw.AbortWindowHours) * time.Hour)
		sw.Status = "triggered"
		sw.TriggeredAt = models.NullTime{NullTime: sql.NullTime{Time: now, Valid: true}}
		sw.AbortDeadline = models.NullTime{NullTime: sql.NullTime{Time: abortDeadline, Valid: true}}
		s.repos.Switch.Update(ctx, sw) //nolint:errcheck
		s.repos.DeathReports.MarkTriggered(ctx, dr.ID) //nolint:errcheck

		owner, _ := s.repos.Users.GetByID(ctx, dr.OwnerID)
		if owner != nil {
			appName := resolveAppName(ctx, s.repos, s.cfg)
			abortURL := fmt.Sprintf("%s/dashboard?abort=true", s.cfg.BaseURL)
			s.email.SendAsync(ctx, owner.Email, "switch_triggered", map[string]string{
				"display_name":   owner.DisplayName,
				"abort_url":      abortURL,
				"abort_deadline": abortDeadline.Format("Monday, January 2 at 3:04 PM MST"),
				"app_name":       appName,
			})
		}
		log.Printf("death report %s expired — switch triggered for owner %s", dr.ID, dr.OwnerID)
	}
}
