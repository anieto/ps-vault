UPDATE switch_settings SET reminder1_hours_before = 72 WHERE reminder1_hours_before IS NULL;
UPDATE switch_settings SET reminder2_hours_before = 12 WHERE reminder2_hours_before IS NULL;
UPDATE switch_settings SET reminder3_hours_before = 2 WHERE reminder3_hours_before IS NULL;

ALTER TABLE switch_settings ALTER COLUMN reminder1_hours_before SET NOT NULL;
ALTER TABLE switch_settings ALTER COLUMN reminder2_hours_before SET NOT NULL;
ALTER TABLE switch_settings ALTER COLUMN reminder3_hours_before SET NOT NULL;

ALTER TABLE switch_settings RENAME COLUMN reminder3_hours_before TO final_warning_hours_before;
ALTER TABLE switch_settings RENAME COLUMN reminder3_sent_at TO final_warning_sent_at;
