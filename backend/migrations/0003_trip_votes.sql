-- Upvotes / downvotes on trip links. One vote per user per link; users can
-- change their mind by upserting or delete their vote (value = 0 in API).
CREATE TABLE trip_link_votes (
    link_id   UUID     NOT NULL REFERENCES trip_links(id) ON DELETE CASCADE,
    user_id   UUID     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    value     SMALLINT NOT NULL CHECK (value IN (-1, 1)),
    voted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (link_id, user_id)
);
CREATE INDEX idx_trip_link_votes_link ON trip_link_votes(link_id);
