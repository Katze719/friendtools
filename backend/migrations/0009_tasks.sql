-- Tasks tool: a shared todo list scoped to a group. Designed for e.g. a
-- flat share where chores and errands are assigned to specific members.
--
-- Optional `assigned_to` (nullable so tasks can sit unassigned), optional
-- `due_date`, and a coarse `priority` bucket. `is_done` + `done_by` /
-- `done_at` mirror the shopping-list pattern so the UI can show who
-- ticked off a task.
CREATE TABLE tasks (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id     UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    title        TEXT NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    assigned_to  UUID REFERENCES users(id) ON DELETE SET NULL,
    due_date     DATE,
    priority     TEXT NOT NULL DEFAULT 'normal'
                 CHECK (priority IN ('low', 'normal', 'high')),
    is_done      BOOLEAN NOT NULL DEFAULT FALSE,
    done_at      TIMESTAMPTZ,
    done_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    created_by   UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (char_length(trim(title)) > 0)
);
CREATE INDEX idx_tasks_group_state
    ON tasks(group_id, is_done, due_date NULLS LAST, created_at DESC);
CREATE INDEX idx_tasks_assignee ON tasks(assigned_to);
