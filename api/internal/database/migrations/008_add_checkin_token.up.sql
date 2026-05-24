ALTER TABLE switch_settings
  ADD COLUMN IF NOT EXISTS email_checkin_token TEXT,
  ADD COLUMN IF NOT EXISTS email_checkin_token_expires TIMESTAMP;
