ALTER TABLE trusted_contacts
  ADD COLUMN can_verify_life      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN can_corroborate_death BOOLEAN NOT NULL DEFAULT FALSE;
