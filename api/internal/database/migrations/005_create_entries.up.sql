CREATE TABLE vault_entries (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vault_id        UUID NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    entry_type      TEXT NOT NULL CHECK (entry_type IN (
                        'login','note','file','contact','financial',
                        'card','identity','crypto','custom'
                    )),
    title           TEXT NOT NULL,
    -- Encrypted entry data (XChaCha20-Poly1305, base64url encoded JSON blob)
    encrypted_data  TEXT NOT NULL,
    is_favorite     BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order      INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE vault_entry_versions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entry_id        UUID NOT NULL REFERENCES vault_entries(id) ON DELETE CASCADE,
    encrypted_data  TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vault_entries_vault_id ON vault_entries (vault_id);
CREATE INDEX idx_vault_entries_type ON vault_entries (vault_id, entry_type);
CREATE INDEX idx_vault_entries_favorite ON vault_entries (vault_id, is_favorite);
CREATE INDEX idx_vault_entry_versions_entry_id ON vault_entry_versions (entry_id);
