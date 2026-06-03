ALTER TABLE delivery_tokens
  ADD COLUMN is_revoked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN revoked_at TIMESTAMPTZ;
