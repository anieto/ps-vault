-- v0.2.0 crypto upgrade: wipe all user data and adopt proper key hierarchy.
--
-- New key hierarchy:
--   Argon2id(password, mek_salt) → KEK
--   random MEK → secretbox(MEK, KEK) → mek_envelope          (stored in users)
--   random MEK → secretbox(MEK, REK) → recovery_key_envelope (stored in users, optional)
--   random CEK → secretbox(CEK, MEK) → cek_envelope          (stored in vaults, unchanged)
--
-- This fixes the password-change ZK gap from v0.1.0: CEK envelopes no longer
-- need to be re-encrypted on password change because the MEK is stable.

-- Wipe all data in FK-safe order
TRUNCATE TABLE
    delivery_tokens,
    death_reports,
    audit_log,
    email_queue,
    invite_codes,
    vault_entry_versions,
    vault_entries,
    vault_beneficiaries,
    beneficiaries,
    trusted_contacts,
    switch_checkins,
    vaults,
    switch_settings,
    sessions,
    users
CASCADE;

-- Add new crypto columns
ALTER TABLE users
    ADD COLUMN mek_salt             TEXT NOT NULL DEFAULT '',
    ADD COLUMN mek_envelope         TEXT NOT NULL DEFAULT '',
    ADD COLUMN recovery_key_envelope TEXT;

-- Remove defaults (only needed to satisfy NOT NULL during ALTER on a populated table;
-- table is empty after TRUNCATE so this is belt-and-suspenders)
ALTER TABLE users
    ALTER COLUMN mek_salt    DROP DEFAULT,
    ALTER COLUMN mek_envelope DROP DEFAULT;
