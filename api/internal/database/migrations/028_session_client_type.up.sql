ALTER TABLE sessions ADD COLUMN client_type TEXT NOT NULL DEFAULT 'web';
ALTER TABLE sessions ADD COLUMN expiry_notified_at TIMESTAMPTZ;
