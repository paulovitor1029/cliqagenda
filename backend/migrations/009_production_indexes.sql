CREATE INDEX IF NOT EXISTS professionals_business_active_idx ON professionals (business_id, active);
CREATE INDEX IF NOT EXISTS services_business_active_idx ON services (business_id, active);
CREATE INDEX IF NOT EXISTS appointments_business_status_idx ON appointments (business_id, status);
