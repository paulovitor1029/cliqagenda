ALTER TABLE businesses ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE businesses SET active = TRUE WHERE active IS NULL;

INSERT INTO users (
  id,
  name,
  email,
  role,
  business_id,
  permissions,
  password_hash,
  password_salt,
  created_at
) VALUES (
  'usr_system_admin_initial',
  'Administrador Geral',
  'admin@cliqagenda.local',
  'system_admin',
  NULL,
  '{}'::jsonb,
  '21d7fcae86351d307f712ba26b04ee246caadb724259eafe81909baf2ec25e1a',
  'cliqagenda-system-admin-salt',
  NOW()
) ON CONFLICT (id) DO NOTHING;
