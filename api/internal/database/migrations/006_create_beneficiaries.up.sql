CREATE TABLE beneficiaries (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name                    TEXT NOT NULL,
    email                   TEXT NOT NULL,
    phone                   TEXT,
    relationship            TEXT,
    notes_enc               TEXT,
    email_confirmed         BOOLEAN NOT NULL DEFAULT FALSE,
    email_confirm_token     TEXT,
    email_confirm_expires   TIMESTAMPTZ,
    verification_method     TEXT NOT NULL DEFAULT 'both'
                                CHECK (verification_method IN ('secret','otp','both')),
    secret_question_enc     TEXT,
    secret_answer_hash      TEXT,
    phone_verified          BOOLEAN NOT NULL DEFAULT FALSE,
    is_active               BOOLEAN NOT NULL DEFAULT TRUE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, email)
);

CREATE TABLE vault_beneficiaries (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vault_id                UUID NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    beneficiary_id          UUID NOT NULL REFERENCES beneficiaries(id) ON DELETE CASCADE,
    -- CEK encrypted with beneficiary's access key (base64url encoded)
    beneficiary_cek_envelope TEXT NOT NULL,
    additional_delay_days   INT NOT NULL DEFAULT 0,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (vault_id, beneficiary_id)
);

CREATE TABLE trusted_contacts (
    id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id                     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name                        TEXT NOT NULL,
    email                       TEXT NOT NULL,
    phone                       TEXT,
    notify_on_final_warning     BOOLEAN NOT NULL DEFAULT FALSE,
    can_abort                   BOOLEAN NOT NULL DEFAULT FALSE,
    abort_token_hash            TEXT,
    abort_token_expires         TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE delivery_tokens (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vault_beneficiary_id    UUID NOT NULL REFERENCES vault_beneficiaries(id) ON DELETE CASCADE,
    token_hash              TEXT NOT NULL UNIQUE,
    is_verified             BOOLEAN NOT NULL DEFAULT FALSE,
    verified_at             TIMESTAMPTZ,
    expires_at              TIMESTAMPTZ NOT NULL,
    access_count            INT NOT NULL DEFAULT 0,
    last_accessed_at        TIMESTAMPTZ,
    ip_address              TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_beneficiaries_user_id ON beneficiaries (user_id);
CREATE INDEX idx_beneficiaries_email ON beneficiaries (user_id, email);
CREATE INDEX idx_vault_beneficiaries_vault_id ON vault_beneficiaries (vault_id);
CREATE INDEX idx_vault_beneficiaries_beneficiary_id ON vault_beneficiaries (beneficiary_id);
CREATE INDEX idx_trusted_contacts_user_id ON trusted_contacts (user_id);
CREATE INDEX idx_delivery_tokens_hash ON delivery_tokens (token_hash);
