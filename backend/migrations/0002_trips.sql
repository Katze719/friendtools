-- Trip planner: members can drop links (Airbnb, Booking, blog posts, ...)
-- and the server caches basic Open-Graph-style metadata for a preview card.
CREATE TABLE trip_links (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id    UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    added_by    UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    url         TEXT NOT NULL,
    title       TEXT,
    description TEXT,
    image_url   TEXT,
    site_name   TEXT,
    note        TEXT NOT NULL DEFAULT '',
    fetched_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_trip_links_group ON trip_links(group_id);
