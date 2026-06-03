package services

import (
	"context"

	"github.com/ps-vault/ps-vault/internal/apierr"
	"github.com/ps-vault/ps-vault/internal/models"
)

// GetByID retrieves a vault by ID without user ownership check (for internal/portal use).
func (s *VaultService) GetByID(ctx context.Context, id string) (*models.Vault, error) {
	vault, err := s.repos.Vaults.GetByID(ctx, id)
	if err != nil {
		return nil, apierr.ErrInternal
	}
	if vault == nil {
		return nil, apierr.ErrNotFound
	}
	return vault, nil
}
