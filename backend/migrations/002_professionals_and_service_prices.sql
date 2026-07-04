CREATE TABLE IF NOT EXISTS professionals (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  specialty TEXT NOT NULL DEFAULT '',
  photo_url TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS professionals_business_idx ON professionals (business_id, active);

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS professional_id TEXT REFERENCES professionals(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS professional_id TEXT REFERENCES professionals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS professional_name TEXT NOT NULL DEFAULT '';

INSERT INTO professionals (id, business_id, name, specialty, photo_url, active)
SELECT
  'pro_' || substr(md5(b.id), 1, 18),
  b.id,
  'Profissional principal',
  'Atendimento geral',
  b.photo_url,
  TRUE
FROM businesses b
WHERE NOT EXISTS (
  SELECT 1 FROM professionals p WHERE p.business_id = b.id
);

UPDATE services s
SET professional_id = p.id
FROM professionals p
WHERE s.business_id = p.business_id
  AND s.professional_id IS NULL;

UPDATE appointments a
SET
  professional_id = p.id,
  professional_name = p.name
FROM professionals p
WHERE a.business_id = p.business_id
  AND (a.professional_id IS NULL OR a.professional_name = '');

DROP INDEX IF EXISTS appointments_active_slot_idx;
DROP INDEX IF EXISTS appointments_active_professional_slot_idx;

CREATE UNIQUE INDEX IF NOT EXISTS appointments_active_professional_slot_idx
  ON appointments (business_id, professional_id, date_value, time_value)
  WHERE status <> 'cancelled';
