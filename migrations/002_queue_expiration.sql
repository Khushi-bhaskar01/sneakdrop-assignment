CREATE TABLE IF NOT EXISTS queue_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sneaker_pair_id INTEGER NOT NULL REFERENCES sneaker_pairs(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('QUEUED', 'PROMOTED', 'CANCELLED')) DEFAULT 'QUEUED',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, sneaker_pair_id)
);

CREATE INDEX IF NOT EXISTS queue_entries_pair_requested_idx
ON queue_entries (sneaker_pair_id, requested_at);

CREATE INDEX IF NOT EXISTS holds_active_expiry_idx
ON holds (sneaker_pair_id, status, expires_at);
