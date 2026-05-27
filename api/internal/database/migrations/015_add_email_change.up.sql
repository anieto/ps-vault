ALTER TABLE users
  ADD COLUMN IF NOT EXISTS pending_email          TEXT,
  ADD COLUMN IF NOT EXISTS email_change_token     TEXT,
  ADD COLUMN IF NOT EXISTS email_change_expires   TIMESTAMP;
