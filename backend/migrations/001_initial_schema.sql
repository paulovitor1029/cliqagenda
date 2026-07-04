CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'barbershop_admin',
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS businesses (
  id TEXT PRIMARY KEY,
  owner_id TEXT UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  whatsapp TEXT NOT NULL,
  business_type TEXT NOT NULL DEFAULT 'Outro',
  address TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  photo_url TEXT NOT NULL DEFAULT '',
  deposit NUMERIC(10,2) NOT NULL DEFAULT 0,
  pix_key TEXT NOT NULL DEFAULT '',
  cancellation_hours INTEGER NOT NULL DEFAULT 6,
  reschedule_hours INTEGER NOT NULL DEFAULT 6,
  allow_client_cancel BOOLEAN NOT NULL DEFAULT TRUE,
  allow_client_reschedule BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS business_working_hours (
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  time_value TIME NOT NULL,
  sort_order INTEGER NOT NULL,
  PRIMARY KEY (business_id, time_value)
);

CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  duration INTEGER NOT NULL DEFAULT 30,
  buffer INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  service_id TEXT NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  service_name TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  date_value DATE NOT NULL,
  time_value TIME NOT NULL,
  customer TEXT NOT NULL,
  phone TEXT NOT NULL,
  coupon TEXT NOT NULL DEFAULT '',
  recurrence INTEGER NOT NULL DEFAULT 0,
  code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'cancelled', 'done', 'noshow')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS appointments_active_slot_idx
  ON appointments (business_id, date_value, time_value)
  WHERE status <> 'cancelled';

CREATE INDEX IF NOT EXISTS appointments_business_date_idx
  ON appointments (business_id, date_value, time_value);

CREATE TABLE IF NOT EXISTS schedule_blocks (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  date_value DATE NOT NULL,
  all_day BOOLEAN NOT NULL DEFAULT FALSE,
  start_time TIME,
  end_time TIME,
  reason TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (all_day = TRUE OR (start_time IS NOT NULL AND end_time IS NOT NULL AND start_time <= end_time))
);

CREATE INDEX IF NOT EXISTS schedule_blocks_business_date_idx
  ON schedule_blocks (business_id, date_value);

CREATE TABLE IF NOT EXISTS waitlist_entries (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  date_value DATE NOT NULL,
  period TEXT NOT NULL,
  service TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sessions_token_idx ON sessions (token);
