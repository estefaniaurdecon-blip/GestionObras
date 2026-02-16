
-- Actualizar el trigger handle_new_user para manejar problemas de encoding
-- Esto previene errores cuando los metadatos tienen caracteres mal codificados

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  target_org_id UUID;
  company_name TEXT;
  invitation_code_param TEXT;
  is_first_user BOOLEAN;
  safe_full_name TEXT;
BEGIN
  -- Obtener código de invitación de metadata de forma segura
  BEGIN
    invitation_code_param := UPPER(TRIM(COALESCE(NEW.raw_user_meta_data->>'invitation_code', '')));
  EXCEPTION WHEN OTHERS THEN
    invitation_code_param := '';
  END;
  
  -- Obtener nombre de empresa de metadata de forma segura, limpiando caracteres inválidos
  BEGIN
    company_name := regexp_replace(
      COALESCE(
        NEW.raw_user_meta_data->>'company_name',
        NEW.raw_user_meta_data->>'full_name',
        split_part(NEW.email, '@', 1)
      ),
      '[^\x20-\x7E\u00C0-\u00FF]', '', 'g'
    );
  EXCEPTION WHEN OTHERS THEN
    company_name := split_part(NEW.email, '@', 1);
  END;

  -- SOLO buscar organización existente si hay un código de invitación
  IF invitation_code_param != '' THEN
    SELECT id INTO target_org_id
    FROM public.organizations
    WHERE UPPER(invitation_code) = invitation_code_param
    LIMIT 1;
  END IF;

  -- Si no se encontró organización por código de invitación, crear una nueva
  IF target_org_id IS NULL THEN
    INSERT INTO public.organizations (name, subscription_status, trial_end_date)
    VALUES (
      company_name,
      'trial',
      now() + interval '7 days'
    )
    RETURNING id INTO target_org_id;
    
    is_first_user := true;
  ELSE
    is_first_user := false;
  END IF;
  
  -- Obtener full_name de forma segura
  BEGIN
    safe_full_name := regexp_replace(
      COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
      '[^\x20-\x7E\u00C0-\u00FF]', '', 'g'
    );
  EXCEPTION WHEN OTHERS THEN
    safe_full_name := split_part(NEW.email, '@', 1);
  END;
  
  -- Crear perfil con nombres limpios
  INSERT INTO public.profiles (
    id, 
    full_name, 
    organization_id, 
    approved,
    email,
    phone,
    position,
    last_login
  )
  VALUES (
    NEW.id,
    safe_full_name,
    target_org_id,
    is_first_user,
    NEW.email,
    regexp_replace(COALESCE(NEW.raw_user_meta_data->>'phone', ''), '[^\x20-\x7E\u00C0-\u00FF]', '', 'g'),
    regexp_replace(COALESCE(NEW.raw_user_meta_data->>'position', ''), '[^\x20-\x7E\u00C0-\u00FF]', '', 'g'),
    now()
  );
  
  -- Asignar rol
  INSERT INTO public.user_roles (user_id, role, organization_id)
  VALUES (
    NEW.id, 
    CASE WHEN is_first_user THEN 'admin'::app_role ELSE 'foreman'::app_role END,
    target_org_id
  );
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error in handle_new_user: %', SQLERRM;
    RAISE;
END;
$$;
