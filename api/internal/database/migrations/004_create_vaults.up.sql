CREATE TABLE vaults (
    id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id                     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name                        TEXT NOT NULL,
    description                 TEXT,
    icon                        TEXT NOT NULL DEFAULT '🔒',
    color                       TEXT NOT NULL DEFAULT '#6366f1',
    status                      TEXT NOT NULL DEFAULT 'active'
                                    CHECK (status IN ('active','draft','archived')),
    -- Encrypted delivery message (XChaCha20-Poly1305, base64url encoded)
    delivery_message_enc        TEXT,
    -- CEK encrypted with user's MEK (base64url encoded)
    cek_envelope                TEXT NOT NULL,
    -- Per-vault switch overrides (NULL = inherit global setting)
    check_in_interval_override  INT,
    abort_window_override       INT,
    switch_enabled              BOOLEAN NOT NULL DEFAULT TRUE,
    additional_delivery_delay_days INT NOT NULL DEFAULT 0,
    -- Post-delivery data retention
    post_delivery_retention     TEXT NOT NULL DEFAULT 'keep'
                                    CHECK (post_delivery_retention IN ('keep','delete_on_expiry','delete_after_days')),
    post_delivery_retention_days INT,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vaults_user_id ON vaults (user_id);
CREATE INDEX idx_vaults_status ON vaults (user_id, status);
