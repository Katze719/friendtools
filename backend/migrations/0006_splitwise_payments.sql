-- Direct money transfers between group members, e.g. "Anna sent Ben 22 EUR
-- via bank transfer to settle up". Payments are subtracted from the running
-- balance exactly like an expense in which the payer's share is the full
-- amount -- the debtor pays, the creditor gets credited.
CREATE TABLE splitwise_payments (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id     UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    from_user    UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    to_user      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
    note         TEXT,
    happened_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by   UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (from_user <> to_user)
);
CREATE INDEX idx_splitwise_payments_group      ON splitwise_payments(group_id);
CREATE INDEX idx_splitwise_payments_happened   ON splitwise_payments(group_id, happened_at DESC);
