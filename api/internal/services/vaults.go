package services

import (
	"context"
	"database/sql"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/ps-vault/ps-vault/internal/apierr"
	"github.com/ps-vault/ps-vault/internal/config"
	"github.com/ps-vault/ps-vault/internal/models"
	"github.com/ps-vault/ps-vault/internal/repository"
)

type VaultService struct {
	repos *repository.Repos
}

type CreateVaultInput struct {
	UserID             string
	Name               string
	Description        string
	Icon               string
	Color              string
	CEKEnvelope        string
	DeliveryMessageEnc string
}

type UpdateVaultInput struct {
	Name                        *string
	Description                 *string
	Icon                        *string
	Color                       *string
	Status                      *string
	DeliveryMessageEnc          *string
	CEKEnvelope                 *string
	SwitchEnabled               *bool
	CheckInIntervalOverride     *int
	AbortWindowOverride         *int
	AdditionalDeliveryDelayDays *int
	PostDeliveryRetention       *string
	PostDeliveryRetentionDays   *int
	AccessMode                  *string
	CascadeWindowDays           *int
	NotifyLockedTiers           *bool
}

func (s *VaultService) Create(ctx context.Context, input CreateVaultInput) (*models.Vault, error) {
	if input.CEKEnvelope == "" {
		return nil, apierr.New(400, "missing_cek", "CEK envelope is required")
	}

	cascadeDefault := 14
	if v, err := s.repos.SystemConfig.Get(ctx, "cascade_window_default"); err == nil && v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			cascadeDefault = n
		}
	}

	vault := &models.Vault{
		ID:                    uuid.New().String(),
		UserID:                input.UserID,
		Name:                  input.Name,
		Icon:                  orDefault(input.Icon, "🔒"),
		Color:                 orDefault(input.Color, "#6366f1"),
		Status:                "active",
		CEKEnvelope:           input.CEKEnvelope,
		SwitchEnabled:         true,
		PostDeliveryRetention: "keep",
		CascadeWindowDays:     cascadeDefault,
	}

	if input.Description != "" {
		vault.Description.String = input.Description
		vault.Description.Valid = true
	}
	if input.DeliveryMessageEnc != "" {
		vault.DeliveryMessageEnc.String = input.DeliveryMessageEnc
		vault.DeliveryMessageEnc.Valid = true
	}

	if err := s.repos.Vaults.Create(ctx, vault); err != nil {
		return nil, apierr.ErrInternal
	}
	return vault, nil
}

func (s *VaultService) Get(ctx context.Context, id, userID string) (*models.Vault, error) {
	vault, err := s.repos.Vaults.GetByIDAndUser(ctx, id, userID)
	if err != nil {
		return nil, apierr.ErrInternal
	}
	if vault == nil {
		return nil, apierr.ErrNotFound
	}
	return vault, nil
}

func (s *VaultService) List(ctx context.Context, userID string) ([]*models.Vault, error) {
	vaults, err := s.repos.Vaults.ListByUser(ctx, userID)
	if err != nil {
		return nil, apierr.ErrInternal
	}
	return vaults, nil
}

func (s *VaultService) Update(ctx context.Context, id, userID string, input UpdateVaultInput) (*models.Vault, error) {
	vault, err := s.repos.Vaults.GetByIDAndUser(ctx, id, userID)
	if err != nil {
		return nil, apierr.ErrInternal
	}
	if vault == nil {
		return nil, apierr.ErrNotFound
	}

	if input.Name != nil {
		vault.Name = *input.Name
	}
	if input.Description != nil {
		vault.Description.String = *input.Description
		vault.Description.Valid = *input.Description != ""
	}
	if input.Icon != nil {
		vault.Icon = *input.Icon
	}
	if input.Color != nil {
		vault.Color = *input.Color
	}
	if input.Status != nil {
		vault.Status = *input.Status
	}
	if input.DeliveryMessageEnc != nil {
		vault.DeliveryMessageEnc.String = *input.DeliveryMessageEnc
		vault.DeliveryMessageEnc.Valid = true
	}
	if input.CEKEnvelope != nil {
		vault.CEKEnvelope = *input.CEKEnvelope
	}
	if input.SwitchEnabled != nil {
		vault.SwitchEnabled = *input.SwitchEnabled
	}
	if input.CheckInIntervalOverride != nil {
		vault.CheckInIntervalOverride.Int32 = int32(*input.CheckInIntervalOverride)
		vault.CheckInIntervalOverride.Valid = true
	}
	if input.AbortWindowOverride != nil {
		vault.AbortWindowOverride.Int32 = int32(*input.AbortWindowOverride)
		vault.AbortWindowOverride.Valid = true
	}
	if input.AdditionalDeliveryDelayDays != nil {
		vault.AdditionalDeliveryDelayDays = *input.AdditionalDeliveryDelayDays
	}
	if input.PostDeliveryRetention != nil {
		vault.PostDeliveryRetention = *input.PostDeliveryRetention
	}
	if input.PostDeliveryRetentionDays != nil {
		vault.PostDeliveryRetentionDays.Int32 = int32(*input.PostDeliveryRetentionDays)
		vault.PostDeliveryRetentionDays.Valid = true
	}
	if input.AccessMode != nil {
		vault.AccessMode = *input.AccessMode
	}
	if input.CascadeWindowDays != nil {
		vault.CascadeWindowDays = *input.CascadeWindowDays
	} else if input.AccessMode != nil && *input.AccessMode == "cascading" && vault.CascadeWindowDays == 0 {
		cascadeDefault := 14
		if v, err := s.repos.SystemConfig.Get(ctx, "cascade_window_default"); err == nil && v != "" {
			if n, err := strconv.Atoi(v); err == nil && n > 0 {
				cascadeDefault = n
			}
		}
		vault.CascadeWindowDays = cascadeDefault
	}
	if input.NotifyLockedTiers != nil {
		vault.NotifyLockedTiers = *input.NotifyLockedTiers
	}

	if err := s.repos.Vaults.Update(ctx, vault); err != nil {
		return nil, apierr.ErrInternal
	}
	return vault, nil
}

func (s *VaultService) Delete(ctx context.Context, id, userID string) error {
	vault, err := s.repos.Vaults.GetByIDAndUser(ctx, id, userID)
	if err != nil {
		return apierr.ErrInternal
	}
	if vault == nil {
		return apierr.ErrNotFound
	}
	return s.repos.Vaults.Delete(ctx, id, userID)
}

// ExportData holds everything needed to build a vault archive.
type ExportData struct {
	Vault   *models.Vault
	Entries []*models.VaultEntry
	Files   []*models.VaultFile
}

func (s *VaultService) GetExportData(ctx context.Context, vaultID, userID string) (*ExportData, error) {
	vault, err := s.repos.Vaults.GetByIDAndUser(ctx, vaultID, userID)
	if err != nil {
		return nil, apierr.ErrInternal
	}
	if vault == nil {
		return nil, apierr.ErrNotFound
	}

	entries, err := s.repos.Entries.ListByVault(ctx, vaultID)
	if err != nil {
		return nil, apierr.ErrInternal
	}

	files, err := s.repos.Files.ListByVault(ctx, vaultID)
	if err != nil {
		return nil, apierr.ErrInternal
	}

	return &ExportData{Vault: vault, Entries: entries, Files: files}, nil
}

func orDefault(s, def string) string {
	if s == "" {
		return def
	}
	return s
}

// ─── Entry Service ────────────────────────────────────────────────────────────

type EntryService struct {
	repos *repository.Repos
}

type CreateEntryInput struct {
	VaultID       string
	EntryType     string
	Title         string
	EncryptedData string
}

type UpdateEntryInput struct {
	Title         *string
	EncryptedData *string
	IsFavorite    *bool
	SortOrder     *int
}

func (s *EntryService) Create(ctx context.Context, input CreateEntryInput) (*models.VaultEntry, error) {
	entry := &models.VaultEntry{
		ID:            uuid.New().String(),
		VaultID:       input.VaultID,
		EntryType:     input.EntryType,
		Title:         input.Title,
		EncryptedData: input.EncryptedData,
	}
	if err := s.repos.Entries.Create(ctx, entry); err != nil {
		return nil, apierr.ErrInternal
	}
	return entry, nil
}

func (s *EntryService) Get(ctx context.Context, id, vaultID string) (*models.VaultEntry, error) {
	entry, err := s.repos.Entries.GetByIDAndVault(ctx, id, vaultID)
	if err != nil {
		return nil, apierr.ErrInternal
	}
	if entry == nil {
		return nil, apierr.ErrNotFound
	}
	return entry, nil
}

func (s *EntryService) List(ctx context.Context, vaultID string) ([]*models.VaultEntry, error) {
	entries, err := s.repos.Entries.ListByVault(ctx, vaultID)
	if err != nil {
		return nil, apierr.ErrInternal
	}
	return entries, nil
}

func (s *EntryService) Update(ctx context.Context, id, vaultID string, input UpdateEntryInput) (*models.VaultEntry, error) {
	entry, err := s.repos.Entries.GetByIDAndVault(ctx, id, vaultID)
	if err != nil {
		return nil, apierr.ErrInternal
	}
	if entry == nil {
		return nil, apierr.ErrNotFound
	}

	// Save version before update
	version := &models.VaultEntryVersion{
		ID:            uuid.New().String(),
		EntryID:       entry.ID,
		EncryptedData: entry.EncryptedData,
	}
	s.repos.Entries.SaveVersion(ctx, version)

	if input.Title != nil {
		entry.Title = *input.Title
	}
	if input.EncryptedData != nil {
		entry.EncryptedData = *input.EncryptedData
	}
	if input.IsFavorite != nil {
		entry.IsFavorite = *input.IsFavorite
	}
	if input.SortOrder != nil {
		entry.SortOrder = *input.SortOrder
	}

	if err := s.repos.Entries.Update(ctx, entry); err != nil {
		return nil, apierr.ErrInternal
	}
	return entry, nil
}

func (s *EntryService) Delete(ctx context.Context, id, vaultID string) error {
	entry, err := s.repos.Entries.GetByIDAndVault(ctx, id, vaultID)
	if err != nil {
		return apierr.ErrInternal
	}
	if entry == nil {
		return apierr.ErrNotFound
	}
	return s.repos.Entries.Delete(ctx, id, vaultID)
}

func (s *EntryService) BulkDelete(ctx context.Context, ids []string, vaultID string) error {
	return s.repos.Entries.BulkDelete(ctx, ids, vaultID)
}

func (s *EntryService) History(ctx context.Context, id, vaultID string) ([]*models.VaultEntryVersion, error) {
	entry, err := s.repos.Entries.GetByIDAndVault(ctx, id, vaultID)
	if err != nil || entry == nil {
		return nil, apierr.ErrNotFound
	}
	return s.repos.Entries.GetVersions(ctx, id)
}

// ─── Beneficiary Service ──────────────────────────────────────────────────────

type BeneficiaryService struct {
	cfg   *config.Config
	repos *repository.Repos
	email *EmailService
}

type CreateBeneficiaryInput struct {
	Name               string
	Email              string
	Phone              string
	Relationship       string
	VerificationMethod string
	SecretQuestion     string
	PhotoData          string
}

type UpdateBeneficiaryInput struct {
	Name           string
	Email          string
	Relationship   string
	SecretQuestion string
	PhotoData      string
}

func (s *BeneficiaryService) Create(ctx context.Context, userID string, input CreateBeneficiaryInput) (*models.Beneficiary, error) {
	token, err := generateSecureToken(32)
	if err != nil {
		return nil, apierr.ErrInternal
	}

	b := &models.Beneficiary{
		ID:                 uuid.New().String(),
		UserID:             userID,
		Name:               input.Name,
		Email:              input.Email,
		IsActive:           true,
		VerificationMethod: orDefault(input.VerificationMethod, "both"),
	}
	if input.Phone != "" {
		b.Phone.String = input.Phone
		b.Phone.Valid = true
	}
	if input.Relationship != "" {
		b.Relationship.String = input.Relationship
		b.Relationship.Valid = true
	}
	if input.SecretQuestion != "" {
		b.SecretQuestionEnc.String = input.SecretQuestion
		b.SecretQuestionEnc.Valid = true
	}
	if input.PhotoData != "" {
		b.PhotoData.String = input.PhotoData
		b.PhotoData.Valid = true
	}

	confirmExpires := time.Now().Add(7 * 24 * time.Hour)
	b.EmailConfirmToken.String = token
	b.EmailConfirmToken.Valid = true
	b.EmailConfirmExpires.Time = confirmExpires
	b.EmailConfirmExpires.Valid = true

	if err := s.repos.Beneficiaries.Create(ctx, b); err != nil {
		return nil, apierr.ErrInternal
	}

	owner, _ := s.repos.Users.GetByID(ctx, userID)
	ownerName := "Someone"
	if owner != nil {
		ownerName = owner.DisplayName
	}

	s.email.SendAsync(ctx, b.Email, "beneficiary_added", map[string]string{
		"beneficiary_name": b.Name,
		"owner_name":       ownerName,
		"app_name": resolveAppName(ctx, s.repos, s.cfg),
	})

	return b, nil
}

func (s *BeneficiaryService) List(ctx context.Context, userID string) ([]*models.Beneficiary, error) {
	return s.repos.Beneficiaries.ListByUser(ctx, userID)
}

func (s *BeneficiaryService) Get(ctx context.Context, id, userID string) (*models.Beneficiary, error) {
	b, err := s.repos.Beneficiaries.GetByIDAndUser(ctx, id, userID)
	if err != nil {
		return nil, apierr.ErrInternal
	}
	if b == nil {
		return nil, apierr.ErrNotFound
	}
	return b, nil
}

func (s *BeneficiaryService) Delete(ctx context.Context, id, userID string) error {
	b, err := s.repos.Beneficiaries.GetByIDAndUser(ctx, id, userID)
	if err != nil {
		return apierr.ErrInternal
	}
	if b == nil {
		return apierr.ErrNotFound
	}
	return s.repos.Beneficiaries.Delete(ctx, id, userID)
}

func (s *BeneficiaryService) Update(ctx context.Context, id, userID string, input UpdateBeneficiaryInput) (*models.Beneficiary, error) {
	b, err := s.repos.Beneficiaries.GetByIDAndUser(ctx, id, userID)
	if err != nil {
		return nil, apierr.ErrInternal
	}
	if b == nil {
		return nil, apierr.ErrNotFound
	}

	if input.Name != "" {
		b.Name = input.Name
	}
	if input.Email != "" {
		b.Email = input.Email
	}
	b.Relationship.String = input.Relationship
	b.Relationship.Valid = input.Relationship != ""
	b.SecretQuestionEnc.String = input.SecretQuestion
	b.SecretQuestionEnc.Valid = input.SecretQuestion != ""
	b.PhotoData.String = input.PhotoData
	b.PhotoData.Valid = input.PhotoData != ""

	if err := s.repos.Beneficiaries.Update(ctx, b); err != nil {
		return nil, apierr.ErrInternal
	}
	return b, nil
}

// --- Trusted Contact management ---

type TrustedContactInput struct {
	Name                 string
	Email                string
	Phone                string
	NotifyOnFinalWarning bool
	CanAbort             bool
	CanVerifyLife        bool
	CanCorroborateDeath  bool
}

func (s *BeneficiaryService) ListTrustedContacts(ctx context.Context, userID string) ([]*models.TrustedContact, error) {
	contacts, err := s.repos.Beneficiaries.GetTrustedContacts(ctx, userID)
	if err != nil {
		return nil, apierr.ErrInternal
	}
	return contacts, nil
}

func (s *BeneficiaryService) CreateTrustedContact(ctx context.Context, userID string, input TrustedContactInput) (*models.TrustedContact, error) {
	tc := &models.TrustedContact{
		ID:                   uuid.New().String(),
		UserID:               userID,
		Name:                 input.Name,
		Email:                input.Email,
		NotifyOnFinalWarning: input.NotifyOnFinalWarning,
		CanAbort:             input.CanAbort,
		CanVerifyLife:        input.CanVerifyLife,
		CanCorroborateDeath:  input.CanCorroborateDeath,
	}
	if input.Phone != "" {
		tc.Phone = models.NullString{NullString: sql.NullString{String: input.Phone, Valid: true}}
	}
	if err := s.repos.Beneficiaries.CreateTrustedContact(ctx, tc); err != nil {
		return nil, apierr.ErrInternal
	}
	return tc, nil
}

func (s *BeneficiaryService) UpdateTrustedContact(ctx context.Context, id, userID string, input TrustedContactInput) (*models.TrustedContact, error) {
	tc, err := s.repos.Beneficiaries.GetTrustedContactByID(ctx, id, userID)
	if err != nil {
		return nil, apierr.ErrInternal
	}
	if tc == nil {
		return nil, apierr.ErrNotFound
	}
	tc.Name = input.Name
	tc.Email = input.Email
	tc.NotifyOnFinalWarning = input.NotifyOnFinalWarning
	tc.CanAbort = input.CanAbort
	tc.CanVerifyLife = input.CanVerifyLife
	tc.CanCorroborateDeath = input.CanCorroborateDeath
	if input.Phone != "" {
		tc.Phone = models.NullString{NullString: sql.NullString{String: input.Phone, Valid: true}}
	} else {
		tc.Phone = models.NullString{}
	}
	if err := s.repos.Beneficiaries.UpdateTrustedContact(ctx, tc); err != nil {
		return nil, apierr.ErrInternal
	}
	return tc, nil
}

func (s *BeneficiaryService) DeleteTrustedContact(ctx context.Context, id, userID string) error {
	tc, err := s.repos.Beneficiaries.GetTrustedContactByID(ctx, id, userID)
	if err != nil {
		return apierr.ErrInternal
	}
	if tc == nil {
		return apierr.ErrNotFound
	}
	return s.repos.Beneficiaries.DeleteTrustedContact(ctx, id, userID)
}

// SetBeneficiaryTier assigns or clears a cascade tier for a beneficiary within a vault.
// Passing nil tier clears it (sets beneficiary back to simultaneous mode for that vault).
func (s *BeneficiaryService) SetBeneficiaryTier(ctx context.Context, vaultID, beneficiaryID, userID string, tier *string, cascadeWindowDays *int) error {
	// Verify vault belongs to user.
	vault, err := s.repos.Vaults.GetByIDAndUser(ctx, vaultID, userID)
	if err != nil {
		return apierr.ErrInternal
	}
	if vault == nil {
		return apierr.ErrNotFound
	}
	// Validate tier value if provided.
	if tier != nil {
		switch *tier {
		case "primary", "secondary", "tertiary":
		default:
			return apierr.New(400, "invalid_tier", "tier must be primary, secondary, or tertiary")
		}
	}
	return s.repos.Beneficiaries.UpdateVaultBeneficiaryTier(ctx, vaultID, beneficiaryID, tier, cascadeWindowDays)
}

func (s *BeneficiaryService) ResendConfirmation(ctx context.Context, id, userID string) error {
	b, err := s.repos.Beneficiaries.GetByIDAndUser(ctx, id, userID)
	if err != nil || b == nil {
		return apierr.ErrNotFound
	}

	owner, _ := s.repos.Users.GetByID(ctx, userID)
	ownerName := "Someone"
	if owner != nil {
		ownerName = owner.DisplayName
	}

	s.email.SendAsync(ctx, b.Email, "beneficiary_added", map[string]string{
		"beneficiary_name": b.Name,
		"owner_name":       ownerName,
		"app_name": resolveAppName(ctx, s.repos, s.cfg),
	})
	return nil
}

