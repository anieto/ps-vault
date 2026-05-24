CREATE TABLE death_reports (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    beneficiary_id      UUID NOT NULL REFERENCES beneficiaries(id) ON DELETE CASCADE,
    status              TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','dismissed','triggered')),
    notes               TEXT,
    document_path       TEXT,
    response_deadline   TIMESTAMPTZ NOT NULL,
    submitted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at         TIMESTAMPTZ,
    verify_token_hash   TEXT,
    verify_token_expires TIMESTAMPTZ
);

CREATE TABLE invite_codes (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code        TEXT NOT NULL UNIQUE,
    created_by  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    used_by     UUID REFERENCES users(id) ON DELETE SET NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE email_queue (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    to_email        TEXT NOT NULL,
    subject         TEXT NOT NULL,
    template_name   TEXT NOT NULL,
    template_data   JSONB NOT NULL DEFAULT '{}',
    status          TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','sent','failed')),
    attempts        INT NOT NULL DEFAULT 0,
    last_attempt_at TIMESTAMPTZ,
    sent_at         TIMESTAMPTZ,
    error_message   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_log (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    event_type  TEXT NOT NULL,
    event_data  JSONB NOT NULL DEFAULT '{}',
    ip_address  TEXT,
    user_agent  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_death_reports_owner ON death_reports (owner_user_id, status);
CREATE INDEX idx_death_reports_deadline ON death_reports (response_deadline) WHERE status = 'pending';
CREATE INDEX idx_invite_codes_code ON invite_codes (code);
CREATE INDEX idx_email_queue_status ON email_queue (status, created_at);
CREATE INDEX idx_audit_log_user_id ON audit_log (user_id, created_at DESC);
CREATE INDEX idx_audit_log_event_type ON audit_log (event_type, created_at DESC);
