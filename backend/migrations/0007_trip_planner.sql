-- Turn the "trip board" tool into a richer trip planner. A trip is still
-- scoped to a group (one trip per group), so we hang all of this off group_id
-- and keep it optional: none of the fields below are required to use the
-- existing link board.

-- ---------------------------------------------------------------------------
-- Trip metadata: dates, destinations, total budget. Nullable everywhere so
-- groups that do not care about "real trip" semantics keep working.
-- Destinations are stored as a JSONB array of objects, e.g.
--   [{ "name": "Lisbon", "lat": 38.72, "lng": -9.14 }]
CREATE TABLE trip_info (
    group_id     UUID PRIMARY KEY REFERENCES groups(id) ON DELETE CASCADE,
    start_date   DATE,
    end_date     DATE,
    destinations JSONB NOT NULL DEFAULT '[]'::jsonb,
    budget_cents BIGINT,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (start_date IS NULL OR end_date IS NULL OR start_date <= end_date),
    CHECK (budget_cents IS NULL OR budget_cents >= 0)
);

-- ---------------------------------------------------------------------------
-- Packing list. Simple flat list; categories are free-text so users are never
-- forced to pick one. Optional assignee for "who's bringing what".
CREATE TABLE trip_packing_items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id    UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    quantity    TEXT NOT NULL DEFAULT '',
    category    TEXT NOT NULL DEFAULT '',
    is_packed   BOOLEAN NOT NULL DEFAULT FALSE,
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    position    INTEGER NOT NULL DEFAULT 0,
    created_by  UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_trip_packing_group ON trip_packing_items(group_id, position);

-- ---------------------------------------------------------------------------
-- Itinerary: loose list of items anchored to a calendar day. Times are
-- optional; when both are null the item renders as "all day". An item can
-- reference a trip_link, which then ON DELETE SET NULL so deleting the link
-- leaves the plan intact.
CREATE TABLE trip_itinerary_items (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id   UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    day_date   DATE NOT NULL,
    title      TEXT NOT NULL,
    start_time TIME,
    end_time   TIME,
    location   TEXT NOT NULL DEFAULT '',
    note       TEXT NOT NULL DEFAULT '',
    link_id    UUID REFERENCES trip_links(id) ON DELETE SET NULL,
    position   INTEGER NOT NULL DEFAULT 0,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (start_time IS NULL OR end_time IS NULL OR start_time <= end_time)
);
CREATE INDEX idx_trip_itinerary_day
    ON trip_itinerary_items(group_id, day_date, position);

-- ---------------------------------------------------------------------------
-- Link board polish: manual position inside a folder (for drag-and-drop)
-- and optional manual overrides when the unfurl didn't produce usable
-- metadata.
ALTER TABLE trip_links
    ADD COLUMN position        INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN title_override  TEXT,
    ADD COLUMN image_override  TEXT;
CREATE INDEX idx_trip_links_folder_pos
    ON trip_links(group_id, folder_id, position);
