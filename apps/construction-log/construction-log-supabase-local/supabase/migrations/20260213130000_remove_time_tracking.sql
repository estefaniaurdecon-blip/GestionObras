-- Remove deprecated time-tracking (fichaje) schema artifacts.

-- Best effort: unschedule any cron jobs that still invoke send-clock-reminders.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    BEGIN
      PERFORM cron.unschedule(jobid)
      FROM cron.job
      WHERE command ILIKE '%send-clock-reminders%';
    EXCEPTION
      WHEN undefined_function THEN
        NULL;
    END;
  END IF;
END
$$;

-- Drop the table and all dependent policies/indexes if it exists.
DROP TABLE IF EXISTS public.time_logs CASCADE;
