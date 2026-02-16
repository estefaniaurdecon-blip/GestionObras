
-- Función para limpiar caracteres mal codificados en los metadatos de usuarios
-- Esta función corrige problemas de encoding que pueden causar errores de login

CREATE OR REPLACE FUNCTION clean_user_metadata()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_record RECORD;
BEGIN
  -- Actualizar perfiles con nombres que puedan tener problemas de encoding
  UPDATE public.profiles
  SET 
    full_name = regexp_replace(full_name, '[^\x20-\x7E\u00C0-\u00FF]', '', 'g'),
    updated_at = now()
  WHERE 
    full_name IS NOT NULL 
    AND full_name ~ '[^\x20-\x7E\u00C0-\u00FF]';

  RAISE NOTICE 'Perfiles actualizados para corregir encoding';
END;
$$;

-- Ejecutar la limpieza
SELECT clean_user_metadata();

-- Limpiar también los nombres de organización
UPDATE public.organizations
SET 
  name = regexp_replace(name, '[^\x20-\x7E\u00C0-\u00FF]', '', 'g'),
  commercial_name = regexp_replace(commercial_name, '[^\x20-\x7E\u00C0-\u00FF]', '', 'g'),
  updated_at = now()
WHERE 
  (name IS NOT NULL AND name ~ '[^\x20-\x7E\u00C0-\u00FF]')
  OR (commercial_name IS NOT NULL AND commercial_name ~ '[^\x20-\x7E\u00C0-\u00FF]');
