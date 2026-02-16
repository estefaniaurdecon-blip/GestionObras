-- Habilitar extensiones necesarias para cron jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Crear cron job para duplicar partes con maquinaria alquilada activa
-- Se ejecuta todos los días a las 6:00 AM UTC
SELECT cron.schedule(
  'auto-duplicate-rental-machinery-daily',
  '0 6 * * *', -- Todos los días a las 6:00 AM UTC
  $$
  SELECT
    net.http_post(
        url:='https://fcjmyylskklmfkogmmwt.supabase.co/functions/v1/auto-duplicate-rental-machinery',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZjam15eWxza2tsbWZrb2dtbXd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxOTY3OTksImV4cCI6MjA3NDc3Mjc5OX0.UgJDhZSfwFZe9IlJuz14DrkIj-I3seGpRynhTDvMxzk"}'::jsonb,
        body:='{}'::jsonb
    ) AS request_id;
  $$
);