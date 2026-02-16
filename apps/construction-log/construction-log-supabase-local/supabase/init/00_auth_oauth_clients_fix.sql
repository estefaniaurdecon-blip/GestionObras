-- Ensure auth.oauth_clients is compatible with current GoTrue migrations
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'auth'
      AND table_name = 'oauth_clients'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'auth'
        AND table_name = 'oauth_clients'
        AND column_name = 'client_id'
    ) THEN
      DROP TABLE auth.oauth_clients CASCADE;
    END IF;
  END IF;
END $$;
