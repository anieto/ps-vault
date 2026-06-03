package services

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/ps-vault/ps-vault/internal/config"
	"github.com/ps-vault/ps-vault/internal/models"
	"github.com/ps-vault/ps-vault/internal/repository"
)

// CascadeService processes tiered beneficiary cascade events.
type CascadeService struct {
	cfg   *config.Config
	repos *repository.Repos
	email *EmailService
}

// RunCascadeChecker is a background goroutine that checks for pending cascades every 15 minutes.
func (s *CascadeService) RunCascadeChecker(ctx context.Context) {
	log.Println("cascade checker started")
	ticker := time.NewTicker(15 * time.Minute)
	defer ticker.Stop()

	// Run immediately on start
	s.runCascadeChecks(ctx)

	for {
		select {
		case <-ctx.Done():
			log.Println("cascade checker stopped")
			return
		case <-ticker.C:
			s.runCascadeChecks(ctx)
		}
	}
}

func (s *CascadeService) runCascadeChecks(ctx context.Context) {
	pending, err := s.repos.Beneficiaries.GetPendingCascades(ctx)
	if err != nil {
		log.Printf("cascade checker: error fetching pending cascades: %v", err)
		return
	}
	if len(pending) == 0 {
		return
	}

	// Deduplicate by (vault_id, tier) — one cascade event per vault per tier.
	type vaultTierKey struct {
		vaultID string
		tier    string
	}
	seen := make(map[vaultTierKey]bool)

	for _, vb := range pending {
		if !vb.Tier.Valid {
			continue
		}
		key := vaultTierKey{vaultID: vb.VaultID, tier: vb.Tier.String}
		if seen[key] {
			continue
		}
		seen[key] = true

		if err := s.processCascade(ctx, vb.VaultID, vb.Tier.String); err != nil {
			log.Printf("cascade checker: error processing cascade for vault %s tier %s: %v",
				vb.VaultID, vb.Tier.String, err)
		}
	}
}

// processCascade unlocks the next tier for a vault and notifies newly unlocked beneficiaries.
func (s *CascadeService) processCascade(ctx context.Context, vaultID, currentTier string) error {
	nextTier := nextTierName(currentTier)
	if nextTier == "" {
		return nil // tertiary has no next tier
	}

	// Unlock next tier beneficiaries.
	if err := s.repos.Beneficiaries.UnlockNextTier(ctx, vaultID, currentTier); err != nil {
		return fmt.Errorf("unlocking next tier: %w", err)
	}

	// Fetch vault and owner info for notification email.
	vault, err := s.repos.Vaults.GetByID(ctx, vaultID)
	if err != nil || vault == nil {
		return fmt.Errorf("fetching vault: %w", err)
	}
	user, err := s.repos.Users.GetByID(ctx, vault.UserID)
	if err != nil || user == nil {
		return fmt.Errorf("fetching vault owner: %w", err)
	}

	// Find the newly unlocked beneficiaries in the next tier.
	assignments, err := s.repos.Beneficiaries.GetVaultAssignmentsByTier(ctx, vaultID, nextTier)
	if err != nil {
		return fmt.Errorf("fetching next-tier assignments: %w", err)
	}

	appName := resolveAppName(ctx, s.repos, s.cfg)

	for _, assignment := range assignments {
		beneficiary, err := s.repos.Beneficiaries.GetByID(ctx, assignment.BeneficiaryID)
		if err != nil || beneficiary == nil || !beneficiary.IsActive {
			continue
		}

		rawToken, err := generateDeliveryToken()
		if err != nil {
			continue
		}

		tokenHash := hashToken(rawToken)
		expiresAt := time.Now().Add(90 * 24 * time.Hour)

		dt := &models.DeliveryToken{
			ID:                 uuid.New().String(),
			VaultBeneficiaryID: assignment.ID,
			TokenHash:          tokenHash,
			ExpiresAt:          expiresAt,
		}
		if err := s.repos.Beneficiaries.CreateDeliveryToken(ctx, dt); err != nil {
			continue
		}

		portalURL := fmt.Sprintf("%s/portal/%s", s.cfg.BaseURL, rawToken)

		s.email.SendAsync(ctx, beneficiary.Email, "beneficiary_delivery", map[string]string{
			"beneficiary_name": beneficiary.Name,
			"owner_name":       user.DisplayName,
			"portal_url":       portalURL,
			"expires_at":       expiresAt.Format("January 2, 2006"),
			"app_name":         appName,
		})

		log.Printf("cascade: notified %s beneficiary %s for vault %s",
			nextTier, beneficiary.Email, vaultID)
	}

	return nil
}

func nextTierName(tier string) string {
	switch tier {
	case "primary":
		return "secondary"
	case "secondary":
		return "tertiary"
	default:
		return ""
	}
}
