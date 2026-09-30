CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sneaker_pairs (
  id SERIAL PRIMARY KEY,
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  colorway TEXT NOT NULL,
  stock_available INTEGER NOT NULL DEFAULT 1 CHECK (stock_available >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory (
  id SERIAL PRIMARY KEY,
  sneaker_pair_id INTEGER NOT NULL UNIQUE REFERENCES sneaker_pairs(id) ON DELETE CASCADE,
  available_stock INTEGER NOT NULL DEFAULT 1 CHECK (available_stock >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sneaker_pair_id INTEGER NOT NULL REFERENCES sneaker_pairs(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'EXPIRED', 'PURCHASED', 'RELEASED')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, sneaker_pair_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS unique_active_hold_per_user
ON holds (user_id)
WHERE status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_event_id TEXT NOT NULL UNIQUE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  hold_id UUID REFERENCES holds(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('payment.succeeded', 'payment.failed')),
  payload JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('RECEIVED', 'PROCESSED', 'REJECTED', 'DUPLICATE')) DEFAULT 'RECEIVED',
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hold_id UUID NOT NULL UNIQUE REFERENCES holds(id) ON DELETE CASCADE,
  sneaker_pair_id INTEGER NOT NULL REFERENCES sneaker_pairs(id) ON DELETE CASCADE,
  payment_event_id TEXT NOT NULL UNIQUE,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
