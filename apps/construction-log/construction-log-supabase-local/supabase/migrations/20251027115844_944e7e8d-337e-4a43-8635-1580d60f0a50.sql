-- Fix RLS policies on work_inventory_sync_log table
-- Drop the overly permissive policy
DROP POLICY IF EXISTS "System can manage sync log" ON public.work_inventory_sync_log;

-- Add proper organization-scoped policies
CREATE POLICY "Admins and managers can manage sync log in their org"
ON public.work_inventory_sync_log
FOR ALL
TO authenticated
USING (
  organization_id = current_user_organization()
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'site_manager'::app_role)
    OR has_role(auth.uid(), 'master'::app_role)
  )
)
WITH CHECK (
  organization_id = current_user_organization()
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'site_manager'::app_role)
    OR has_role(auth.uid(), 'master'::app_role)
  )
);

-- Fix SECURITY DEFINER functions missing search_path protection
-- Update handle_new_user function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
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
  
  -- Crear perfil
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
    is_first_user,
    NEW.email,
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'position',
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
$function$;

-- Update update_updated_at_column function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;