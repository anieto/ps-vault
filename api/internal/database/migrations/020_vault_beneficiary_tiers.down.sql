DROP INDEX IF EXISTS idx_vault_beneficiaries_tier;

ALTER TABLE vault_beneficiaries
  DROP COLUMN IF EXISTS tier,
  DROP COLUMN IF EXISTS tier_unlocked_at,
  DROP COLUMN IF EXISTS tier_cascade_window_days;

ALTER TABLE vaults
  DROP COLUMN IF EXISTS access_mode,
  DROP COLUMN IF EXISTS cascade_window_days;
