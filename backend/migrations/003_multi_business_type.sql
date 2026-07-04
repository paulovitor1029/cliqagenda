ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS business_type TEXT NOT NULL DEFAULT 'Outro';

UPDATE businesses
SET business_type = 'Beleza e estética'
WHERE business_type IS NULL OR business_type = '';
