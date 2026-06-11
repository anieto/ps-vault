package services

import (
	"context"

	"github.com/ps-vault/ps-vault/internal/config"
	"github.com/ps-vault/ps-vault/internal/repository"
)

// resolveAppName returns the DB-configured app name override if set,
// otherwise falls back to cfg.AppName. Follows the same pattern as maxFileSizeBytes.
func resolveAppName(ctx context.Context, repos *repository.Repos, cfg *config.Config) string {
	if v, err := repos.SystemConfig.Get(ctx, "app_name_override"); err == nil && v != "" {
		return v
	}
	return cfg.AppName
}

// Services bundles all service instances.
type Services struct {
	Auth          *AuthService
	Vaults        *VaultService
	Entries       *EntryService
	Beneficiaries *BeneficiaryService
	Switch        *SwitchService
	Email         *EmailService
	Delivery      *DeliveryService
	Cascade       *CascadeService
	Admin         *AdminService
	Files         *FileService
	Push          *PushService
	DeathReport   *DeathReportService
	WebAuthn      *WebAuthnService
}

func New(cfg *config.Config, repos *repository.Repos) (*Services, error) {
	email := NewEmailService(cfg)
	push := NewPushService(cfg, repos)

	switchSvc := &SwitchService{cfg: cfg, repos: repos, email: email, push: push}
	delivery := &DeliveryService{cfg: cfg, repos: repos, email: email}
	switchSvc.delivery = delivery
	deathReportSvc := &DeathReportService{cfg: cfg, repos: repos, email: email, push: push}
	switchSvc.deathReport = deathReportSvc

	webAuthn, err := NewWebAuthnService(cfg, repos)
	if err != nil {
		return nil, err
	}

	return &Services{
		Auth:          &AuthService{cfg: cfg, repos: repos, email: email},
		Vaults:        &VaultService{repos: repos},
		Entries:       &EntryService{repos: repos},
		Beneficiaries: &BeneficiaryService{cfg: cfg, repos: repos, email: email},
		Switch:        switchSvc,
		Email:         email,
		Delivery:      delivery,
		Cascade:       &CascadeService{cfg: cfg, repos: repos, email: email},
		Admin:         &AdminService{cfg: cfg, repos: repos, email: email},
		Files:         &FileService{cfg: cfg, repos: repos},
		Push:          push,
		DeathReport:   deathReportSvc,
		WebAuthn:      webAuthn,
	}, nil
}
