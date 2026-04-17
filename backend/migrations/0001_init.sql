CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users with admin-controlled approval flow.
-- `status='pending'` users cannot log in until an admin approves them.
CREATE TABLE users (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email          TEXT NOT NULL UNIQUE,
    display_name   TEXT NOT NULL,
    password_hash  TEXT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'approved')),
    is_admin       BOOLEAN NOT NULL DEFAULT FALSE,
    approved_at    TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_users_status ON users(status);

-- A "group" is a top-level circle of friends (e.g. a flat, a trip, a crew).
-- Every tool (splitwise, future ones) operates on data scoped to a group.
CREATE TABLE groups (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT NOT NULL,
    invite_code  TEXT NOT NULL UNIQUE,
    currency     TEXT NOT NULL DEFAULT 'EUR',
    created_by   UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_groups_created_by ON groups(created_by);

CREATE TABLE group_members (
    group_id   UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role       TEXT NOT NULL DEFAULT 'member'
               CHECK (role IN ('member', 'owner')),
    joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (group_id, user_id)
);
CREATE INDEX idx_group_members_user ON group_members(user_id);

-- Splitwise tool: expenses scoped to a group.
CREATE TABLE expenses (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id       UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    paid_by        UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    description    TEXT NOT NULL,
    amount_cents   BIGINT NOT NULL CHECK (amount_cents > 0),
    happened_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by     UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_expenses_group ON expenses(group_id);
CREATE INDEX idx_expenses_paid_by ON expenses(paid_by);

CREATE TABLE expense_splits (
    expense_id    UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    amount_cents  BIGINT NOT NULL CHECK (amount_cents >= 0),
    PRIMARY KEY (expense_id, user_id)
);
CREATE INDEX idx_expense_splits_user ON expense_splits(user_id);
