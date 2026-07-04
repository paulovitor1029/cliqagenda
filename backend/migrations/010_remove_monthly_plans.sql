-- Remocao definitiva da regra de planos mensais.
DROP INDEX IF EXISTS businesses_plan_idx;
ALTER TABLE businesses DROP COLUMN IF EXISTS plan;
