ALTER TABLE professionals
ADD COLUMN IF NOT EXISTS public_slug TEXT;

DELETE FROM professionals
WHERE name = 'Profissional principal'
  AND specialty = 'Atendimento geral';

UPDATE professionals
SET public_slug = CONCAT(
  COALESCE(
    NULLIF(
      TRIM(BOTH '-' FROM REGEXP_REPLACE(LOWER(name), '[^a-z0-9]+', '-', 'g')),
      ''
    ),
    'profissional'
  ),
  '-',
  SUBSTRING(MD5(id), 1, 8)
)
WHERE public_slug IS NULL OR public_slug = '';

ALTER TABLE professionals
ALTER COLUMN public_slug SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS professionals_public_slug_idx
ON professionals (public_slug);

DELETE FROM businesses WHERE id = 'biz_demo';
DELETE FROM users WHERE id = 'usr_demo_admin';
