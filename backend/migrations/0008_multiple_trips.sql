-- Multiple trips per group. Previously each group had exactly one trip
-- (`trip_info` was keyed by group_id). We introduce a proper `trips` table
-- and re-anchor every child resource to `trip_id`.
--
-- Since the tool is not in production yet we drop+recreate instead of a
-- data migration: the consumer flow explicitly asked to skip preserving
-- existing rows.

-- --------------------------------------------------------------------
-- Drop all old trip tables. CASCADE clears dependent FKs in one shot.
DROP TABLE IF EXISTS trip_info             CASCADE;
DROP TABLE IF EXISTS trip_itinerary_items  CASCADE;
DROP TABLE IF EXISTS trip_packing_items    CASCADE;
DROP TABLE IF EXISTS trip_link_votes       CASCADE;
DROP TABLE IF EXISTS trip_links            CASCADE;
DROP TABLE IF EXISTS trip_folders          CASCADE;

-- --------------------------------------------------------------------
-- A trip is a concrete vacation/event scoped to a group. Any group can
-- have multiple trips; only the ones owned by the group's members are
-- visible to them (enforced at handler level via group membership).
CREATE TABLE trips (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id      UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    start_date    DATE,
    end_date      DATE,
    destinations  JSONB NOT NULL DEFAULT '[]'::jsonb,
    budget_cents  BIGINT,
    position      INTEGER NOT NULL DEFAULT 0,
    created_by    UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (start_date IS NULL OR end_date IS NULL OR start_date <= end_date),
    CHECK (budget_cents IS NULL OR budget_cents >= 0),
    CHECK (char_length(trim(name)) > 0)
);
CREATE INDEX idx_trips_group ON trips(group_id, position, created_at);

-- --------------------------------------------------------------------
-- Folders are per-trip again. Deleting the trip cascades.
CREATE TABLE trip_folders (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id    UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_trip_folders_trip ON trip_folders(trip_id, created_at);

-- --------------------------------------------------------------------
-- Links: per-trip, optionally inside a folder. When a folder is deleted
-- the links fall back into the implicit "unsorted" bucket.
CREATE TABLE trip_links (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id         UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    folder_id       UUID REFERENCES trip_folders(id) ON DELETE SET NULL,
    added_by        UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    url             TEXT NOT NULL,
    title           TEXT,
    description     TEXT,
    image_url       TEXT,
    site_name       TEXT,
    title_override  TEXT,
    image_override  TEXT,
    note            TEXT NOT NULL DEFAULT '',
    position        INTEGER NOT NULL DEFAULT 0,
    fetched_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_trip_links_trip     ON trip_links(trip_id);
CREATE INDEX idx_trip_links_folder   ON trip_links(folder_id);
CREATE INDEX idx_trip_links_position ON trip_links(trip_id, folder_id, position);

-- --------------------------------------------------------------------
-- Votes: unchanged structure, still FKed to the (new) trip_links.
CREATE TABLE trip_link_votes (
    link_id   UUID     NOT NULL REFERENCES trip_links(id) ON DELETE CASCADE,
    user_id   UUID     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    value     SMALLINT NOT NULL CHECK (value IN (-1, 1)),
    voted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (link_id, user_id)
);
CREATE INDEX idx_trip_link_votes_link ON trip_link_votes(link_id);

-- --------------------------------------------------------------------
-- Packing items, per-trip.
CREATE TABLE trip_packing_items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id     UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
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
CREATE INDEX idx_trip_packing_trip ON trip_packing_items(trip_id, position);

-- --------------------------------------------------------------------
-- Itinerary items, per-trip. Optional reference back to a trip_link.
CREATE TABLE trip_itinerary_items (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id    UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
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
CREATE INDEX idx_trip_itinerary_day ON trip_itinerary_items(trip_id, day_date, position);
