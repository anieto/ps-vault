CREATE TABLE switch_settings (
    id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id                     UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    is_active                   BOOLEAN NOT NULL DEFAULT FALSE,
    check_in_interval_days      INT NOT NULL DEFAULT 7,
    reminder1_days_before       INT NOT NULL DEFAULT 2,
    reminder2_hours_before      INT NOT NULL DEFAULT 12,
    final_warning_hours_before  INT NOT NULL DEFAULT 2,
    abort_window_hours          INT NOT NULL DEFAULT 12,
    death_report_response_hours INT NOT NULL DEFAULT 24,
    max_pause_days              INT NOT NULL DEFAULT 180,
    status                      TEXT NOT NULL DEFAULT 'inactive'
                                    CHECK (status IN ('inactive','active','paused','triggered','delivered')),
    last_checkin_at             TIMESTAMPTZ,
    next_checkin_deadline       TIMESTAMPTZ,
    paused_until                TIMESTAMPTZ,
    triggered_at                TIMESTAMPTZ,
    abort_deadline              TIMESTAMPTZ,
    reminder1_sent_at           TIMESTAMPTZ,
    reminder2_sent_at           TIMESTAMPTZ,
    final_warning_sent_at       TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE switch_checkins (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    method      TEXT NOT NULL CHECK (method IN ('email','sms','web','mobile','manual')),
    ip_address  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_switch_settings_user_id ON switch_settings (user_id);
CREATE INDEX idx_switch_settings_status ON switch_settings (status);
CREATE INDEX idx_switch_settings_next_deadline ON switch_settings (next_checkin_deadline)
    WHERE status = 'active';
CREATE INDEX idx_switch_checkins_user_id ON switch_checkins (user_id);
