ALTER TABLE switch_settings RENAME COLUMN final_warning_hours_before TO reminder3_hours_before;
ALTER TABLE switch_settings RENAME COLUMN final_warning_sent_at TO reminder3_sent_at;

ALTER TABLE switch_settings ALTER COLUMN reminder1_hours_before DROP NOT NULL;
ALTER TABLE switch_settings ALTER COLUMN reminder2_hours_before DROP NOT NULL;
ALTER TABLE switch_settings ALTER COLUMN reminder3_hours_before DROP NOT NULL;
