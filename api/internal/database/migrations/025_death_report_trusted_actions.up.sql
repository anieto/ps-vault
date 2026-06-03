-- Tokens issued to trusted contacts when a death report is submitted.
-- action: 'verify_life' (dismisses the report) | 'corroborate' (shortens the response window)
CREATE TABLE death_report_trusted_actions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    death_report_id UUID NOT NULL REFERENCES death_reports(id) ON DELETE CASCADE,
    contact_id      UUID NOT NULL REFERENCES trusted_contacts(id) ON DELETE CASCADE,
    contact_email   TEXT NOT NULL,
    contact_name    TEXT NOT NULL,
    action          TEXT NOT NULL,
    token_hash      TEXT NOT NULL UNIQUE,
    token_expires   TIMESTAMPTZ NOT NULL,
    used_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_death_report_trusted_actions_report ON death_report_trusted_actions(death_report_id);
