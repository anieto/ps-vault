ALTER TABLE vault_files
    ADD COLUMN IF NOT EXISTS storage_backend TEXT NOT NULL DEFAULT 'local';
