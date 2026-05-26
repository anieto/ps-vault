ALTER TABLE delivery_tokens
  DROP COLUMN IF EXISTS is_revoked,
  DROP COLUMN IF EXISTS revoked_at;
