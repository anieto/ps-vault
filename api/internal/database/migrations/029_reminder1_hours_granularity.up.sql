ALTER TABLE switch_settings ADD COLUMN reminder1_hours_before INT;
UPDATE switch_settings SET reminder1_hours_before = reminder1_days_before * 24;
ALTER TABLE switch_settings ALTER COLUMN reminder1_hours_before SET NOT NULL;
ALTER TABLE switch_settings ALTER COLUMN reminder1_hours_before SET DEFAULT 72;
ALTER TABLE switch_settings DROP COLUMN reminder1_days_before;
