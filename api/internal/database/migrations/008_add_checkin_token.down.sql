ALTER TABLE switch_settings
  DROP COLUMN IF EXISTS email_checkin_token,
  DROP COLUMN IF EXISTS email_checkin_token_expires;
