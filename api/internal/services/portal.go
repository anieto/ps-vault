package services

import (
	"context"

	"github.com/google/uuid"
	"github.com/ps-vault/ps-vault/internal/apierr"
	"github.com/ps-vault/ps-vault/internal/models"
	"github.com/ps-vault/ps-vault/internal/repository"
)

// GetDeliveryToken retrieves a delivery token by its hash.
func (s *BeneficiaryService) GetDeliveryToken(ctx context.Context, tokenHash string) (*models.DeliveryToken, error) {
	dt, err := s.repos.Beneficiaries.GetDeliveryToken(ctx, tokenHash)
	if err != nil {
		return nil, apierr.ErrInternal
	}
	return dt, nil
}

// VerifyDeliveryToken marks a delivery token as verified.
func (s *BeneficiaryService) VerifyDeliveryToken(ctx context.Context, tokenID, ip string) error {
	if err := s.repos.Beneficiaries.MarkDeliveryTokenVerified(ctx, tokenID, ip); err != nil {
		return apierr.ErrInternal
	}
	return nil
}

// GetVaultBeneficiary retrieves a vault-beneficiary assignment by ID.
func (s *BeneficiaryService) GetVaultBeneficiary(ctx context.Context, id string) (*models.VaultBeneficiary, error) {
	vb, err := s.repos.Beneficiaries.GetVaultBeneficiaryByID(ctx, id)
	if err != nil {
		return nil, apierr.ErrInternal
	}
	return vb, nil
}

// GetVaultBeneficiaries lists all beneficiaries assigned to a vault (verifies vault ownership).
func (s *BeneficiaryService) GetVaultBeneficiaries(ctx context.Context, vaultID, userID string) ([]*repository.VaultBeneficiaryDetail, error) {
	vault, err := s.repos.Vaults.GetByIDAndUser(ctx, vaultID, userID)
	if err != nil {
		return nil, apierr.ErrInternal
	}
	if vault == nil {
		return nil, apierr.ErrNotFound
	}
	result, err := s.repos.Beneficiaries.GetVaultAssignmentsWithInfo(ctx, vaultID)
	if err != nil {
		return nil, apierr.ErrInternal
	}
	return result, nil
}

// AssignToVault assigns a beneficiary to a vault with their CEK envelope.
func (s *BeneficiaryService) AssignToVault(ctx context.Context, vaultID, beneficiaryID, userID, cekEnvelope string) error {
	vault, err := s.repos.Vaults.GetByIDAndUser(ctx, vaultID, userID)
	if err != nil {
		return apierr.ErrInternal
	}
	if vault == nil {
		return apierr.ErrNotFound
	}
	b, err := s.repos.Beneficiaries.GetByIDAndUser(ctx, beneficiaryID, userID)
	if err != nil {
		return apierr.ErrInternal
	}
	if b == nil {
		return apierr.ErrNotFound
	}
	return s.repos.Beneficiaries.AssignToVault(ctx, &models.VaultBeneficiary{
		ID:                     uuid.New().String(),
		VaultID:                vaultID,
		BeneficiaryID:          beneficiaryID,
		BeneficiaryCEKEnvelope: cekEnvelope,
	})
}

// RemoveFromVault removes a beneficiary from a vault (verifies vault ownership).
func (s *BeneficiaryService) RemoveFromVault(ctx context.Context, vaultID, beneficiaryID, userID string) error {
	vault, err := s.repos.Vaults.GetByIDAndUser(ctx, vaultID, userID)
	if err != nil {
		return apierr.ErrInternal
	}
	if vault == nil {
		return apierr.ErrNotFound
	}
	return s.repos.Beneficiaries.RemoveFromVault(ctx, vaultID, beneficiaryID)
}
