CREATE UNIQUE INDEX idx_vault_beneficiaries_tier
  ON vault_beneficiaries (vault_id, tier)
  WHERE tier IS NOT NULL;
