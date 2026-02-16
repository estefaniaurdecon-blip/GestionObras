-- Función más agresiva para limpiar completamente los datos de usuario
CREATE OR REPLACE FUNCTION public.complete_user_data_reset(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  user_email text;
  user_name text;
BEGIN
  -- Obtener email del usuario
  SELECT email INTO user_email FROM auth.users WHERE id = target_user_id;
  
  -- Obtener nombre limpio del perfil
  SELECT regexp_replace(COALESCE(full_name, 'Usuario'), '[^\x20-\x7E]', '', 'g')
  INTO user_name
  FROM public.profiles WHERE id = target_user_id;
  
  IF user_name IS NULL OR user_name = '' THEN
    user_name := 'Usuario';
  END IF;

  -- 1. Eliminar TODAS las sesiones
  DELETE FROM auth.sessions WHERE user_id = target_user_id;
  
  -- 2. Eliminar TODOS los refresh tokens
  DELETE FROM auth.refresh_tokens WHERE user_id = target_user_id::text;
  
  -- 3. Limpiar raw_user_meta_data con datos mínimos ASCII
  UPDATE auth.users 
  SET raw_user_meta_data = jsonb_build_object('full_name', user_name),
      raw_app_meta_data = jsonb_build_object('provider', 'email', 'providers', ARRAY['email'])
  WHERE id = target_user_id;
  
  -- 4. Limpiar identity_data en identities
  UPDATE auth.identities
  SET identity_data = jsonb_build_object(
    'sub', target_user_id::text,
    'email', user_email,
    'email_verified', true,
    'phone_verified', false
  )
  WHERE user_id = target_user_id;
  
  -- 5. Limpiar también el perfil público
  UPDATE public.profiles
  SET full_name = user_name
  WHERE id = target_user_id;
  
  RAISE NOTICE 'Complete reset done for user % with name %', target_user_id, user_name;
END;
$$;