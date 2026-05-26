package services

import (
	"github.com/ps-vault/ps-vault/internal/config"
	"github.com/ps-vault/ps-vault/internal/repository"
)

// Services bundles all service instances.
type Services struct {
	Auth          *AuthService
	Vaults        *VaultService
	Entries       *EntryService
	Beneficiaries *BeneficiaryService
	Switch        *SwitchService
	Email         *EmailService
	Delivery      *DeliveryService
	Admin         *AdminService
	Files         *FileService
}

func New(cfg *config.Config, repos *repository.Repos) *Services {
	email := NewEmailService(cfg)

	switchSvc := &SwitchService{cfg: cfg, repos: repos, email: email}
	delivery := &DeliveryService{cfg: cfg, repos: repos, email: email}
	switchSvc.delivery = delivery

	return &Services{
		Auth:          &AuthService{cfg: cfg, repos: repos, email: email},
		Vaults:        &VaultService{repos: repos},
		Entries:       &EntryService{repos: repos},
		Beneficiaries: &BeneficiaryService{cfg: cfg, repos: repos, email: email},
		Switch:        switchSvc,
		Email:         email,
		Delivery:      delivery,
		Admin:         &AdminService{cfg: cfg, repos: repos, email: email},
		Files:         &FileService{cfg: cfg, repos: repos},
	}
}
