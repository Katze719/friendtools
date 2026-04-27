-- Google Calendar one-way sync (Friendflow → Google): OAuth tokens per user
-- and outbound event id mapping for PATCH/DELETE.

CREATE TABLE user_google_calendar (
    user_id              UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    refresh_token_enc    BYTEA NOT NULL,
    google_calendar_id   TEXT NOT NULL DEFAULT 'primary',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE google_calendar_sync_map (
    user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entity_kind          TEXT NOT NULL CHECK (entity_kind IN ('calendar_event', 'trip')),
    entity_id            UUID NOT NULL,
    google_calendar_id   TEXT NOT NULL DEFAULT 'primary',
    google_event_id      TEXT NOT NULL,
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, entity_kind, entity_id)
);

CREATE INDEX idx_google_sync_map_entity
    ON google_calendar_sync_map (entity_kind, entity_id);
