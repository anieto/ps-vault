-- This migration truncated all user data and cannot be reversed.
-- Rolling back removes the added columns only.
ALTER TABLE users
    DROP COLUMN IF EXISTS mek_salt,
    DROP COLUMN IF EXISTS mek_envelope,
    DROP COLUMN IF EXISTS recovery_key_envelope;
