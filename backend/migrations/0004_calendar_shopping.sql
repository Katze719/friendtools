-- Shared calendar: events scoped to a group.
-- `ends_at` is optional so members can pin point-in-time reminders.
-- `all_day` is a display hint; the server still stores full timestamps so
-- timezone-correct ordering works consistently.
CREATE TABLE calendar_events (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id    UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    created_by  UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    title       TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    location    TEXT NOT NULL DEFAULT '',
    starts_at   TIMESTAMPTZ NOT NULL,
    ends_at     TIMESTAMPTZ,
    all_day     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_calendar_events_group_start
    ON calendar_events(group_id, starts_at);

-- Shared shopping list: plain checklist, anyone in the group can tick
-- items off. `position` is not needed for the MVP; we sort by done state
-- + recency in the query.
CREATE TABLE shopping_items (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id   UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    added_by   UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    name       TEXT NOT NULL,
    quantity   TEXT NOT NULL DEFAULT '',
    note       TEXT NOT NULL DEFAULT '',
    is_done    BOOLEAN NOT NULL DEFAULT FALSE,
    done_by    UUID REFERENCES users(id) ON DELETE SET NULL,
    done_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_shopping_items_group_state
    ON shopping_items(group_id, is_done, created_at DESC);
