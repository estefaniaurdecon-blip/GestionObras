-- Fix handle_new_user to NOT auto-approve users
-- New users should be pending approval by organization admins
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_org_id UUID;
  company_name TEXT;
BEGIN
  -- Get company name from metadata, fallback to email domain
  company_name := COALESCE(
    NEW.raw_user_meta_data->>'company_name',
    NEW.raw_user_meta_data->>'full_name',
    split_part(NEW.email, '@', 1) || ' Organization'
  );

  -- Create new organization for this user
  INSERT INTO public.organizations (name, subscription_status, trial_end_date)
  VALUES (
    company_name,
    'trial',
    now() + interval '7 days'
  )
  RETURNING id INTO new_org_id;
  
  -- Create profile with the new organization
  -- First user is NOT auto-approved - they need admin approval
  INSERT INTO public.profiles (id, full_name, organization_id, approved)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    new_org_id,
    false  -- NOT auto-approved, needs admin approval
  );
  
  -- Assign admin role (but user still needs to be approved to access the system)
  INSERT INTO public.user_roles (user_id, role, organization_id)
  VALUES (NEW.id, 'admin', new_org_id);
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error in handle_new_user: %', SQLERRM;
    RAISE;
END;
$$;