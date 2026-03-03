-- DEPRECATED: moved to backend celery beat task AUTO_DUPLICATE_JOB_NAME
DO $$
DECLARE
  has_pg_cron boolean;
  has_jobname boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_extension
    WHERE extname = 'pg_cron'
  ) INTO has_pg_cron;

  IF NOT has_pg_cron THEN
    RAISE NOTICE 'pg_cron extension is not installed; skipping legacy auto-duplicate cron cleanup.';
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'cron'
      AND table_name = 'job'
      AND column_name = 'jobname'
  ) INTO has_jobname;

  IF has_jobname THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname IN (
      'auto-duplicate-rental-machinery-daily',
      'auto-duplicate-rental-machinery-daily-0700'
    );
  END IF;

  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE command ILIKE '%trigger_auto_duplicate_rental_machinery%'
     OR command ILIKE '%/functions/v1/auto-duplicate-rental-machinery%';
EXCEPTION
  WHEN undefined_table OR undefined_function THEN
    NULL;
END
$$;
