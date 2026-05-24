package services

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/ps-vault/ps-vault/internal/config"
	"github.com/ps-vault/ps-vault/internal/models"
	"github.com/ps-vault/ps-vault/internal/repository"
)

type DeliveryService struct {
	cfg   *config.Config
	repos *repository.Repos
	email *EmailService
}

// DeliverVaults triggers delivery for all active vaults belonging to a user.
func (s *DeliveryService) DeliverVaults(ctx context.Context, userID string) error {
	user, err := s.repos.Users.GetByID(ctx, userID)
	if err != nil || user == nil {
		return fmt.Errorf("user not found: %s", userID)
	}

	vaults, err := s.repos.Vaults.ListActiveByUser(ctx, userID)
	if err != nil {
		return fmt.Errorf("listing vaults: %w", err)
	}

	for _, vault := range vaults {
		if err := s.deliverVault(ctx, user, vault); err != nil {
			return fmt.Errorf("delivering vault %s: %w", vault.ID, err)
		}
	}

	return nil
}

func (s *DeliveryService) deliverVault(ctx context.Context, user *models.User, vault *models.Vault) error {
	assignments, err := s.repos.Beneficiaries.GetVaultAssignments(ctx, vault.ID)
	if err != nil {
		return err
	}

	for _, assignment := range assignments {
		beneficiary, err := s.repos.Beneficiaries.GetByID(ctx, assignment.BeneficiaryID)
		if err != nil || beneficiary == nil || !beneficiary.IsActive {
			continue
		}

		// Generate a secure delivery token
		rawToken, err := generateDeliveryToken()
		if err != nil {
			continue
		}

		tokenHash := hashToken(rawToken)
		expiresAt := time.Now().Add(90 * 24 * time.Hour) // 90 days default

		dt := &models.DeliveryToken{
			ID:                 uuid.New().String(),
			VaultBeneficiaryID: assignment.ID,
			TokenHash:          tokenHash,
			ExpiresAt:          expiresAt,
		}

		if err := s.repos.Beneficiaries.CreateDeliveryToken(ctx, dt); err != nil {
			continue
		}

		// Build portal URL
		portalURL := fmt.Sprintf("%s/portal/%s", s.cfg.BaseURL, rawToken)

		s.email.SendAsync(ctx, beneficiary.Email, "beneficiary_delivery", map[string]string{
			"beneficiary_name": beneficiary.Name,
			"owner_name":       user.DisplayName,
			"portal_url":       portalURL,
			"expires_at":       expiresAt.Format("January 2, 2006"),
			"app_name":         s.cfg.AppName,
		})
	}

	return nil
}

func generateDeliveryToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
