ALTER TABLE switch_settings
  ADD COLUMN preferred_checkin_hour SMALLINT DEFAULT NULL
    CHECK (preferred_checkin_hour >= 0 AND preferred_checkin_hour <= 23);
