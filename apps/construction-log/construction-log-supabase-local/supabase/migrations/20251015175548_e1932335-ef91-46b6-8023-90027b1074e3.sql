-- Actualizar handle_new_user para usar los nuevos campos de organization y profiles
-- Esta función se ejecuta cuando un nuevo usuario se registra

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  target_org_id UUID;
  company_name TEXT;
  invitation_code_param TEXT;
  is_first_user BOOLEAN;
BEGIN
  -- Obtener código de invitación de metadata
  invitation_code_param := UPPER(TRIM(COALESCE(NEW.raw_user_meta_data->>'invitation_code', '')));
  
  -- Obtener nombre de empresa de metadata
  company_name := COALESCE(
    NEW.raw_user_meta_data->>'company_name',
    NEW.raw_user_meta_data->>'full_name',
    split_part(NEW.email, '@', 1)
  );

  -- SOLO buscar organización existente si hay un código de invitación
  IF invitation_code_param != '' THEN
    SELECT id INTO target_org_id
    FROM public.organizations
    WHERE UPPER(invitation_code) = invitation_code_param
    LIMIT 1;
  END IF;

  -- Si no se encontró organización por código de invitación, crear una nueva
  -- (incluso si el nombre de empresa ya existe)
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
  
  -- Crear perfil con los nuevos campos
  -- El email y phone se extraen de metadata si están disponibles
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
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    target_org_id,
    is_first_user,  -- Primer usuario de nueva org es auto-aprobado, otros necesitan aprobación
    NEW.email,  -- Email del auth.users
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'position',
    now()
  );
  
  -- Asignar rol: admin para primer usuario, foreman para otros (pendiente de aprobación)
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