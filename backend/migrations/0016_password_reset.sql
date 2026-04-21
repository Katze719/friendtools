-- Password recovery via email.
--
-- One row per pending reset request. We never store the raw token - only
-- a SHA-256 hex digest - so leaking the table (without also leaking
-- `JWT_SECRET`) doesn't give an attacker a way to reset passwords.
--
-- Tokens are single-use (`used_at`) and time-limited (`expires_at`,
-- typically one hour after creation). Expired/used rows are kept around
-- long enough to answer "already used" vs "invalid" on the UI and to aid
-- debugging; a periodic cleanup can prune them later if the table grows.

CREATE TABLE password_reset_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_password_reset_tokens_user ON password_reset_tokens(user_id);
CREATE INDEX idx_password_reset_tokens_expires ON password_reset_tokens(expires_at);
