-- Fase 4: recursos operacionais avancados
-- - profissionais/servicos desativaveis sem apagar historico
-- - horarios individuais por profissional
-- - multiplos usuarios ADM por negocio com permissoes
-- - pagamentos Pix locais
-- - lembretes WhatsApp

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS business_id TEXT REFERENCES businesses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{"settings": true, "professionals": true, "services": true, "appointments": true, "blocks": true, "clients": true, "finance": true, "users": true}'::jsonb;

UPDATE users
SET business_id = businesses.id
FROM businesses
WHERE businesses.owner_id = users.id
  AND users.business_id IS NULL;

CREATE INDEX IF NOT EXISTS users_business_idx ON users (business_id);

CREATE TABLE IF NOT EXISTS professional_working_hours (
  professional_id TEXT NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  time_value TIME NOT NULL,
  sort_order INTEGER NOT NULL,
  PRIMARY KEY (professional_id, time_value)
);

INSERT INTO professional_working_hours (professional_id, time_value, sort_order)
SELECT p.id, bwh.time_value, bwh.sort_order
FROM professionals p
JOIN business_working_hours bwh ON bwh.business_id = p.business_id
ON CONFLICT (professional_id, time_value) DO NOTHING;

ALTER TABLE schedule_blocks
  ADD COLUMN IF NOT EXISTS professional_id TEXT REFERENCES professionals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS schedule_blocks_professional_date_idx
  ON schedule_blocks (business_id, professional_id, date_value);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  appointment_id TEXT REFERENCES appointments(id) ON DELETE SET NULL,
  provider TEXT NOT NULL DEFAULT 'local_pix',
  method TEXT NOT NULL DEFAULT 'pix',
  status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'cancelled', 'expired', 'refunded')) DEFAULT 'pending',
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  pix_key TEXT NOT NULL DEFAULT '',
  pix_copy_paste TEXT NOT NULL DEFAULT '',
  external_id TEXT NOT NULL DEFAULT '',
  paid_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payments_business_status_idx ON payments (business_id, status);
CREATE INDEX IF NOT EXISTS payments_appointment_idx ON payments (appointment_id);

CREATE TABLE IF NOT EXISTS reminder_logs (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  appointment_id TEXT REFERENCES appointments(id) ON DELETE SET NULL,
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  status TEXT NOT NULL DEFAULT 'queued',
  provider TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS reminder_logs_business_idx ON reminder_logs (business_id, sent_at);
