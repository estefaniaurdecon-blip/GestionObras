-- Corregir función para limpiar sesiones
CREATE OR REPLACE FUNCTION public.clean_user_sessions(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Eliminar todas las sesiones del usuario
  DELETE FROM auth.sessions WHERE user_id = target_user_id;
  
  -- Eliminar todos los refresh tokens del usuario (user_id es varchar en esta tabla)
  DELETE FROM auth.refresh_tokens WHERE user_id = target_user_id::text;
  
  RAISE NOTICE 'Sessions cleaned for user %', target_user_id;
END;
$$;