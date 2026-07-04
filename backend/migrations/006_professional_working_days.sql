ALTER TABLE professionals
ADD COLUMN IF NOT EXISTS working_days JSONB NOT NULL DEFAULT '[1,2,3,4,5,6]'::jsonb;
