package handlers

import (
	"github.com/ps-vault/ps-vault/internal/config"
	"github.com/ps-vault/ps-vault/internal/services"
)

// Handlers bundles all HTTP handler groups.
type Handlers struct {
	Auth            *AuthHandler
	Users           *UsersHandler
	Vaults          *VaultsHandler
	Entries         *EntriesHandler
	Beneficiaries   *BeneficiariesHandler
	TrustedContacts *TrustedContactsHandler
	Switch          *SwitchHandler
	Files           *FilesHandler
	Portal          *PortalHandler
	DeathReport         *DeathReportHandler
	BeneficiaryAccess   *BeneficiaryAccessHandler
	Admin           *AdminHandler
	Health          *HealthHandler
	Push            *PushHandler
	WellKnown       *WellKnownHandler
	Passkeys        *PasskeysHandler
}

func New(cfg *config.Config, svcs *services.Services) *Handlers {
	return &Handlers{
		Auth:            &AuthHandler{cfg: cfg, svc: svcs.Auth},
		Users:           &UsersHandler{svc: svcs.Auth, svcs: svcs},
		Vaults:          &VaultsHandler{svc: svcs.Vaults, fileSvc: svcs.Files},
		Entries:         &EntriesHandler{vaultSvc: svcs.Vaults, entrySvc: svcs.Entries},
		Beneficiaries:   &BeneficiariesHandler{svc: svcs.Beneficiaries},
		TrustedContacts: &TrustedContactsHandler{svc: svcs.Beneficiaries},
		Switch:          &SwitchHandler{svc: svcs.Switch},
		Files:           &FilesHandler{cfg: cfg, svc: svcs.Files, vaultSvc: svcs.Vaults},
		Portal:          &PortalHandler{cfg: cfg, svcs: svcs},
		DeathReport:         &DeathReportHandler{cfg: cfg, svcs: svcs},
		BeneficiaryAccess:   &BeneficiaryAccessHandler{svcs: svcs},
		Admin:           &AdminHandler{svc: svcs.Admin},
		Health:          &HealthHandler{},
		Push:            &PushHandler{svc: svcs.Push},
		WellKnown:       &WellKnownHandler{cfg: cfg},
		Passkeys:        &PasskeysHandler{cfg: cfg, waSvc: svcs.WebAuthn, authSvc: svcs.Auth},
	}
}
