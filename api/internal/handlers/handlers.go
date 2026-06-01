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
	DeathReport     *DeathReportHandler
	Admin           *AdminHandler
	Health          *HealthHandler
	Push            *PushHandler
}

func New(cfg *config.Config, svcs *services.Services) *Handlers {
	return &Handlers{
		Auth:            &AuthHandler{cfg: cfg, svc: svcs.Auth},
		Users:           &UsersHandler{svc: svcs.Auth},
		Vaults:          &VaultsHandler{svc: svcs.Vaults, fileSvc: svcs.Files},
		Entries:         &EntriesHandler{vaultSvc: svcs.Vaults, entrySvc: svcs.Entries},
		Beneficiaries:   &BeneficiariesHandler{svc: svcs.Beneficiaries},
		TrustedContacts: &TrustedContactsHandler{svc: svcs.Beneficiaries},
		Switch:          &SwitchHandler{svc: svcs.Switch},
		Files:           &FilesHandler{cfg: cfg, svc: svcs.Files, vaultSvc: svcs.Vaults},
		Portal:          &PortalHandler{cfg: cfg, svcs: svcs},
		DeathReport:     &DeathReportHandler{cfg: cfg, svcs: svcs},
		Admin:           &AdminHandler{svc: svcs.Admin},
		Health:          &HealthHandler{},
		Push:            &PushHandler{svc: svcs.Push},
	}
}
