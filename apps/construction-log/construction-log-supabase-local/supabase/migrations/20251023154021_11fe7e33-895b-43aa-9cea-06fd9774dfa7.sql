-- Eliminar el cron job existente
SELECT cron.unschedule('auto-duplicate-rental-machinery-daily');

-- Crear el cron job actualizado para ejecutarse a las 18:00 UTC (6:00 AM hora local)
SELECT cron.schedule(
  'auto-duplicate-rental-machinery-daily',
  '0 18 * * *', -- Todos los días a las 18:00 UTC (6:00 AM hora local)
  $$
  SELECT net.http_post(
    url := 'https://fcjmyylskklmfkogmmwt.supabase.co/functions/v1/auto-duplicate-rental-machinery',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZjam15eWxza2tsbWZrb2dtbXd0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTE5Njc5OSwiZXhwIjoyMDc0NzcyNzk5fQ.FV8elQUJYLZZdcdFTvLyRRDMOZr0KWJmQp2eMPiEqD8'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);