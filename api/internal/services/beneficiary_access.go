package services

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/ps-vault/ps-vault/internal/models"
)

// BeneficiaryOwnerEntry is one owner relationship shown in the pre-trigger portal.
type BeneficiaryOwnerEntry struct {
	OwnerDisplayName string `json:"owner_display_name"`
	VaultCount       int    `json:"vault_count"`
	EmailConfirmed   bool   `json:"email_confirmed"`
	BeneficiaryID    string `json:"beneficiary_id"`
}

// BeneficiaryPortalInfo is the response for the pre-trigger portal.
type BeneficiaryPortalInfo struct {
	BeneficiaryName string                  `json:"beneficiary_name"`
	Email           string                  `json:"email"`
	Owners          []BeneficiaryOwnerEntry `json:"owners"`
}

// InitiateAccess sends a magic link to the given email if any beneficiary records
// are associated with it. Always returns nil to prevent email enumeration.
func (s *BeneficiaryService) InitiateAccess(ctx context.Context, email string) error {
	// Confirm at least one relationship exists (silently succeed either way).
	bens, err := s.repos.Beneficiaries.GetByEmail(ctx, email)
	if err != nil || len(bens) == 0 {
		return nil
	}

	raw, err := generateDeliveryToken()
	if err != nil {
		return nil
	}

	tokenHash := hashAccessToken(raw)
	t := &models.BeneficiaryAccessToken{
		ID:        uuid.New().String(),
		Email:     email,
		TokenHash: tokenHash,
		ExpiresAt: time.Now().Add(30 * time.Minute),
		CreatedAt: time.Now(),
	}
	if err := s.repos.Beneficiaries.CreateAccessToken(ctx, t); err != nil {
		return nil
	}

	appName := resolveAppName(ctx, s.repos, s.cfg)
	link := fmt.Sprintf("%s/access?token=%s", s.cfg.BaseURL, raw)
	s.email.SendAsync(ctx, email, "beneficiary_access_link", map[string]string{
		"link":     link,
		"app_name": appName,
	})
	return nil
}

// GetPortalInfo validates a raw access token and returns the beneficiary's portal data.
func (s *BeneficiaryService) GetPortalInfo(ctx context.Context, rawToken string) (*BeneficiaryPortalInfo, error) {
	t, err := s.repos.Beneficiaries.GetAccessTokenByHash(ctx, hashAccessToken(rawToken))
	if err != nil || t == nil {
		return nil, fmt.Errorf("invalid or expired link")
	}

	// Mark used so it can't be replayed.
	s.repos.Beneficiaries.MarkAccessTokenUsed(ctx, t.ID) //nolint:errcheck

	bens, err := s.repos.Beneficiaries.GetByEmail(ctx, t.Email)
	if err != nil || len(bens) == 0 {
		return nil, fmt.Errorf("no beneficiary records found")
	}

	beneficiaryName := bens[0].Name

	var owners []BeneficiaryOwnerEntry
	for _, b := range bens {
		owner, err := s.repos.Users.GetByID(ctx, b.UserID)
		if err != nil || owner == nil {
			continue
		}
		count, _ := s.repos.Beneficiaries.CountVaultsByBeneficiaryID(ctx, b.ID)
		owners = append(owners, BeneficiaryOwnerEntry{
			OwnerDisplayName: owner.DisplayName,
			VaultCount:       count,
			EmailConfirmed:   b.EmailConfirmed,
			BeneficiaryID:    b.ID,
		})
	}

	return &BeneficiaryPortalInfo{
		BeneficiaryName: beneficiaryName,
		Email:           t.Email,
		Owners:          owners,
	}, nil
}

func hashAccessToken(raw string) string {
	return hashDeathToken(raw) // same SHA-256 hex pattern
}
