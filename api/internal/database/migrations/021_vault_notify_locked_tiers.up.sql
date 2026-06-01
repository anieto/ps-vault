-- Allow vault owners to opt-in to notifying secondary/tertiary beneficiaries
-- immediately when the switch triggers (awareness-only, no access link yet).
ALTER TABLE vaults ADD COLUMN notify_locked_tiers BOOLEAN NOT NULL DEFAULT FALSE;
