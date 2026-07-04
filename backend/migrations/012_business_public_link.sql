DROP INDEX IF EXISTS professionals_public_slug_idx;

ALTER TABLE professionals
DROP COLUMN IF EXISTS public_slug;
