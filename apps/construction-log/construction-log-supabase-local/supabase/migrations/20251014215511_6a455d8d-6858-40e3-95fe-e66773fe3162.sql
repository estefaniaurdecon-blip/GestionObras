-- Modificar la función handle_new_user para crear SIEMPRE una nueva organización
-- a menos que se proporcione un código de invitación válido

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  target_org_id UUID;
  company_name TEXT;
  invitation_code_param TEXT;
  is_first_user BOOLEAN;
BEGIN
  -- Get invitation code from metadata
  invitation_code_param := UPPER(TRIM(COALESCE(NEW.raw_user_meta_data->>'invitation_code', '')));
  
  -- Get company name from metadata
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
  
  -- Create profile
  INSERT INTO public.profiles (id, full_name, organization_id, approved)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    target_org_id,
    is_first_user  -- First user of new org is auto-approved, others need approval
  );
  
  -- Assign role: admin for first user, foreman for others (pending approval)
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
$function$;