-- Magic link tokens sent to a beneficiary's email to verify identity before submitting a death report
CREATE TABLE death_report_tokens (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    token_hash        TEXT NOT NULL UNIQUE,
    reporter_email    TEXT NOT NULL,
    owner_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    beneficiary_id    UUID REFERENCES beneficiaries(id) ON DELETE SET NULL,
    expires_at        TIMESTAMPTZ NOT NULL,
    used_at           TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Submitted death reports
CREATE TABLE death_reports (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_email          TEXT NOT NULL,
    owner_id                UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    beneficiary_id          UUID REFERENCES beneficiaries(id) ON DELETE SET NULL,
    status                  TEXT NOT NULL DEFAULT 'pending',   -- pending | dismissed | triggered
    response_deadline       TIMESTAMPTZ NOT NULL,
    halfway_alert_sent      BOOLEAN NOT NULL DEFAULT FALSE,
    verify_token_hash       TEXT,
    verify_token_expires    TIMESTAMPTZ,
    date_of_passing         TEXT,
    notes                   TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at             TIMESTAMPTZ
);

CREATE INDEX idx_death_reports_owner_status ON death_reports(owner_id, status);
CREATE INDEX idx_death_reports_status_deadline ON death_reports(status, response_deadline) WHERE status = 'pending';
