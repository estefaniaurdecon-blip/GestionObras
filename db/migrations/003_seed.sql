-- 003_seed.sql
SET client_encoding = 'UTF8';
BEGIN;

-- Seed: obras
INSERT INTO obras (num_obra, promotora, nombre_obra) VALUES
(1234,
    'Microsoft',
    'Proyecto Automate')
ON CONFLICT (num_obra) DO UPDATE SET
    promotora = EXCLUDED.promotora,
    nombre_obra = EXCLUDED.nombre_obra,
    updated_at = CURRENT_TIMESTAMP;
COMMIT;
