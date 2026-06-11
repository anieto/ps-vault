-- Passkey credentials registered by users
CREATE TABLE passkeys (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    credential_id TEXT NOT NULL UNIQUE,
    public_key    TEXT NOT NULL,
    aaguid        TEXT NOT NULL DEFAULT '',
    sign_count    BIGINT NOT NULL DEFAULT 0,
    transports    TEXT NOT NULL DEFAULT '[]',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at  TIMESTAMPTZ
);

CREATE INDEX idx_passkeys_user_id ON passkeys(user_id);

-- Short-lived WebAuthn challenge state (begin → finish ceremony)
CREATE TABLE webauthn_challenges (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_data TEXT NOT NULL,
    type         TEXT NOT NULL CHECK (type IN ('registration', 'authentication')),
    expires_at   TIMESTAMPTZ NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webauthn_challenges_user_id ON webauthn_challenges(user_id);
