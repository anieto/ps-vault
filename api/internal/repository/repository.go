package repository

import "github.com/jmoiron/sqlx"

// Repos bundles all repository interfaces.
type Repos struct {
	Users         *UserRepo
	Sessions      *SessionRepo
	Vaults        *VaultRepo
	Entries       *EntryRepo
	Beneficiaries *BeneficiaryRepo
	Switch        *SwitchRepo
	AuditLog      *AuditLogRepo
	InviteCodes   *InviteCodeRepo
	EmailQueue    *EmailQueueRepo
	Files         *FileRepo
	SystemConfig  *SystemConfigRepo
	PushTokens    *PushTokenRepo
	DeathReports  *DeathReportRepo
}

func New(db *sqlx.DB) *Repos {
	return &Repos{
		Users:         &UserRepo{db: db},
		Sessions:      &SessionRepo{db: db},
		Vaults:        &VaultRepo{db: db},
		Entries:       &EntryRepo{db: db},
		Beneficiaries: &BeneficiaryRepo{db: db},
		Switch:        &SwitchRepo{db: db},
		AuditLog:      &AuditLogRepo{db: db},
		InviteCodes:   &InviteCodeRepo{db: db},
		EmailQueue:    NewEmailQueueRepo(db),
		Files:         &FileRepo{db: db},
		SystemConfig:  &SystemConfigRepo{db: db},
		PushTokens:    &PushTokenRepo{db: db},
		DeathReports:  &DeathReportRepo{db: db},
	}
}
