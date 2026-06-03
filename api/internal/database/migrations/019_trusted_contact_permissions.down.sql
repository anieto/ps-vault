ALTER TABLE trusted_contacts
  DROP COLUMN IF EXISTS can_verify_life,
  DROP COLUMN IF EXISTS can_corroborate_death;
