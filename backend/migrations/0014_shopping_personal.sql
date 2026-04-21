-- Personal shopping lists.
--
-- Lists and items grow a second ownership axis that mirrors the calendar
-- split introduced in 0012: rows either belong to a group (shared with
-- every member, current behaviour) or to a single user (personal list,
-- only visible to its owner). A CHECK constraint enforces exactly-one
-- owner per row; existing rows stay group-owned without change.

ALTER TABLE shopping_lists
    ALTER COLUMN group_id DROP NOT NULL,
    ADD COLUMN owner_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    ADD CONSTRAINT shopping_lists_owner_xor
        CHECK ((group_id IS NOT NULL) <> (owner_user_id IS NOT NULL));

CREATE INDEX idx_shopping_lists_owner
    ON shopping_lists(owner_user_id)
    WHERE owner_user_id IS NOT NULL;

ALTER TABLE shopping_items
    ALTER COLUMN group_id DROP NOT NULL,
    ADD COLUMN owner_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    ADD CONSTRAINT shopping_items_owner_xor
        CHECK ((group_id IS NOT NULL) <> (owner_user_id IS NOT NULL));

CREATE INDEX idx_shopping_items_owner_state
    ON shopping_items(owner_user_id, is_done, created_at DESC)
    WHERE owner_user_id IS NOT NULL;
