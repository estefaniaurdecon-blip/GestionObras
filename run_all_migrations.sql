-- run_all_migrations.sql
-- Ejecuta en orden
BEGIN;
\i db/migrations/001_create.sql
\i db/migrations/002_constraints.sql
COMMIT;

\i db/migrations/003_seed.sql
\i db/migrations/004_import.sql
\i db/migrations/005_validation.sql
\i db/migrations/006_add_comparative.sql
