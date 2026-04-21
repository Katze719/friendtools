-- Personal tasks.
--
-- Tasks grow a second ownership axis mirroring the calendar/shopping
-- split: either group-owned (shared with all members, current behaviour)
-- or owned by a single user (private todo list at /me/tasks). The
-- `assigned_to` column stays free-form for group tasks; personal tasks
-- always have `assigned_to = NULL` since the owner is implicit.

ALTER TABLE tasks
    ALTER COLUMN group_id DROP NOT NULL,
    ADD COLUMN owner_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    ADD CONSTRAINT tasks_owner_xor
        CHECK ((group_id IS NOT NULL) <> (owner_user_id IS NOT NULL));

CREATE INDEX idx_tasks_owner_state
    ON tasks(owner_user_id, is_done, due_date NULLS LAST, created_at DESC)
    WHERE owner_user_id IS NOT NULL;
