-- Paso 1: Agregar nuevos roles al enum
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'site_manager';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'reader';