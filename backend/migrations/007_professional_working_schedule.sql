ALTER TABLE professionals
ADD COLUMN IF NOT EXISTS working_schedule JSONB NOT NULL DEFAULT '{}'::jsonb;
