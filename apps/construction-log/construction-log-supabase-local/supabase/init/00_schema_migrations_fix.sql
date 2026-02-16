-- Ensure schema_migrations has inserted_at column (required by some services like realtime)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'schema_migrations'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'schema_migrations'
      AND column_name = 'inserted_at'
  ) THEN
    ALTER TABLE public.schema_migrations
    ADD COLUMN inserted_at timestamptz;
  END IF;
END $$;
