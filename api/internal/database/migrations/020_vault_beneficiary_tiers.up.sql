-- Vault access mode: simultaneous (default) or cascading
ALTER TABLE vaults
  ADD COLUMN access_mode         TEXT NOT NULL DEFAULT 'simultaneous'
    CHECK (access_mode IN ('simultaneous', 'cascading')),
  ADD COLUMN cascade_window_days INT  NOT NULL DEFAULT 30;

-- Tier within a cascading vault assignment (NULL = simultaneous, not tiered)
ALTER TABLE vault_beneficiaries
  ADD COLUMN tier                      TEXT CHECK (tier IN ('primary', 'secondary', 'tertiary')),
  ADD COLUMN tier_unlocked_at          TIMESTAMPTZ,
  ADD COLUMN tier_cascade_window_days  INT;

-- Ensure only one beneficiary per tier per vault (only enforced when tier is set)
CREATE UNIQUE INDEX idx_vault_beneficiaries_tier
  ON vault_beneficiaries (vault_id, tier)
  WHERE tier IS NOT NULL;
