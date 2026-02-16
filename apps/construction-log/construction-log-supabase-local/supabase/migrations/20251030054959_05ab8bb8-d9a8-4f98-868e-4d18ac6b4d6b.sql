-- Habilitar extensiones necesarias para cron jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Eliminar cron job anterior si existe
SELECT cron.unschedule('auto-duplicate-rental-machinery-daily');

-- Crear cron job que ejecute la función cada día a las 07:00 UTC (08:00 hora española)
SELECT cron.schedule(
  'auto-duplicate-rental-machinery-daily',
  '0 7 * * *', -- A las 07:00 UTC todos los días (08:00 hora española)
  $$
  SELECT
    net.http_post(
        url:='https://fcjmyylskklmfkogmmwt.supabase.co/functions/v1/auto-duplicate-rental-machinery',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZjam15eWxza2tsbWZrb2dtbXd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxOTY3OTksImV4cCI6MjA3NDc3Mjc5OX0.UgJDhZSfwFZe9IlJuz14DrkIj-I3seGpRynhTDvMxzk"}'::jsonb,
        body:=concat('{"time": "', now(), '"}')::jsonb
    ) as request_id;
  $$
);