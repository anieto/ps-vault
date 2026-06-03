CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE users (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email               TEXT NOT NULL UNIQUE,
    display_name        TEXT NOT NULL,
    password_hash       TEXT NOT NULL,
    key_verification_hash TEXT NOT NULL,
    argon2_params       JSONB NOT NULL DEFAULT '{}',
    email_verified      BOOLEAN NOT NULL DEFAULT FALSE,
    email_verify_token  TEXT,
    email_verify_expires TIMESTAMPTZ,
    mfa_enabled         BOOLEAN NOT NULL DEFAULT FALSE,
    mfa_secret          TEXT,
    mfa_backup_codes    TEXT,
    role                TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    timezone            TEXT NOT NULL DEFAULT 'UTC',
    failed_login_attempts INT NOT NULL DEFAULT 0,
    locked_until        TIMESTAMPTZ,
    last_login_at       TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_role ON users (role);
