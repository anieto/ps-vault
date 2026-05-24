package repository

import "github.com/jmoiron/sqlx"

// Repos bundles all repository interfaces.
type Repos struct {
	Users        *UserRepo
	Sessions     *SessionRepo
	Vaults       *VaultRepo
	Entries      *EntryRepo
	Beneficiaries *BeneficiaryRepo
	Switch       *SwitchRepo
	AuditLog     *AuditLogRepo
	InviteCodes  *InviteCodeRepo
}

func New(db *sqlx.DB) *Repos {
	return &Repos{
		Users:        &UserRepo{db: db},
		Sessions:     &SessionRepo{db: db},
		Vaults:       &VaultRepo{db: db},
		Entries:      &EntryRepo{db: db},
		Beneficiaries: &BeneficiaryRepo{db: db},
		Switch:       &SwitchRepo{db: db},
		AuditLog:     &AuditLogRepo{db: db},
		InviteCodes:  &InviteCodeRepo{db: db},
	}
}
