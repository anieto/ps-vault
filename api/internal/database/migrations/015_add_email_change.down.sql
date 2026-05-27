ALTER TABLE users
  DROP COLUMN IF EXISTS pending_email,
  DROP COLUMN IF EXISTS email_change_token,
  DROP COLUMN IF EXISTS email_change_expires;
