CREATE TABLE system_config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed defaults (env vars win at startup via AdminService.SeedDefaults)
INSERT INTO system_config (key, value) VALUES
  ('max_file_size_mb', '200'),
  ('registration_mode', 'invite')
ON CONFLICT (key) DO NOTHING;
