-- Función para limpiar metadatos de usuario con caracteres UTF-8 inválidos
CREATE OR REPLACE FUNCTION public.fix_user_utf8_metadata(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Actualizar raw_user_meta_data eliminando caracteres problemáticos
  UPDATE auth.users 
  SET raw_user_meta_data = jsonb_build_object(
    'full_name', COALESCE(
      regexp_replace(
        raw_user_meta_data->>'full_name', 
        '[^\x20-\x7E\u00A0-\u00FF]', 
        '', 
        'g'
      ),
      ''
    )
  )
  WHERE id = target_user_id;
END;
$$;