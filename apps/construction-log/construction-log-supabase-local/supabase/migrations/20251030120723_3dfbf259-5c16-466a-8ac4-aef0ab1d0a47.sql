-- Eliminar el cron job actual
SELECT cron.unschedule('auto-duplicate-rental-machinery-daily');

-- Crear cron job que se ejecute a las 06:00 UTC (08:00 AM hora española en verano UTC+2)
SELECT cron.schedule(
  'auto-duplicate-rental-machinery-daily',
  '0 6 * * *', -- A las 06:00 UTC todos los días (08:00 hora española en verano)
  $$
  SELECT
    net.http_post(
        url:='https://fcjmyylskklmfkogmmwt.supabase.co/functions/v1/auto-duplicate-rental-machinery',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZjam15eWxza2tsbWZrb2dtbXd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxOTY3OTksImV4cCI6MjA3NDc3Mjc5OX0.UgJDhZSfwFZe9IlJuz14DrkIj-I3seGpRynhTDvMxzk"}'::jsonb,
        body:=concat('{"time": "', now(), '"}')::jsonb
    ) as request_id;
  $$
);