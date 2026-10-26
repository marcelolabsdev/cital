-- Política de cancelación: modo 'hours' (anticipación en horas) o 'no_refund'.
ALTER TABLE tenants ADD COLUMN cancellation_policy_mode TEXT NOT NULL DEFAULT 'hours';

-- El negocio de prueba pasa a "sin reembolso"
UPDATE tenants SET cancellation_policy_mode = 'no_refund' WHERE slug = 'don-pedro-barberia';
