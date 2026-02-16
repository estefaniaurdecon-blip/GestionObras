-- Arreglar el search_path de la función para seguridad
DROP FUNCTION IF EXISTS public.trigger_auto_duplicate_rental_machinery();

CREATE OR REPLACE FUNCTION public.trigger_auto_duplicate_rental_machinery()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  supabase_url text;
  supabase_anon_key text;
BEGIN
  -- Obtener las variables de entorno (estas se configuran en Supabase)
  supabase_url := current_setting('app.settings.supabase_url', true);
  supabase_anon_key := current_setting('app.settings.supabase_anon_key', true);
  
  -- Si no hay variables configuradas, usar las del proyecto actual
  IF supabase_url IS NULL THEN
    supabase_url := 'https://fcjmyylskklmfkogmmwt.supabase.co';
  END IF;
  
  IF supabase_anon_key IS NULL THEN
    supabase_anon_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZjam15eWxza2tsbWZrb2dtbXd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxOTY3OTksImV4cCI6MjA3NDc3Mjc5OX0.UgJDhZSfwFZe9IlJuz14DrkIj-I3seGpRynhTDvMxzk';
  END IF;
  
  -- Invocar la edge function usando http
  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/auto-duplicate-rental-machinery',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || supabase_anon_key,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  
  RAISE NOTICE 'Auto-duplicate function triggered successfully';
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error triggering auto-duplicate function: %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION public.trigger_auto_duplicate_rental_machinery() IS 
'Función que invoca la edge function de clonación automática de maquinaria de alquiler. 
Programada para ejecutarse de lunes a viernes a las 6:00 AM.';