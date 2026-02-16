-- Primero, eliminar el cron job existente
SELECT cron.unschedule('auto-duplicate-rental-machinery-daily');

-- Crear el cron job con SERVICE_ROLE_KEY para que tenga los permisos necesarios
SELECT
  cron.schedule(
    'auto-duplicate-rental-machinery-daily',
    '0 6 * * *', -- Todos los días a las 6:00 AM UTC
    $$
    SELECT
      net.http_post(
          url:='https://fcjmyylskklmfkogmmwt.supabase.co/functions/v1/auto-duplicate-rental-machinery',
          headers:=jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
          ),
          body:='{}'::jsonb
      ) AS request_id;
    $$
  );