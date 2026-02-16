-- Fix the handle_new_user function to properly handle new registrations
-- The issue is that each new user should create their own organization
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
  -- Get company name from metadata, fallback to email if not provided
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
  INSERT INTO public.profiles (id, full_name, organization_id, approved)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    new_org_id,
    true  -- Auto-approve the first user (admin) of the organization
  );
  
  -- Assign admin role to the first user of the organization
  INSERT INTO public.user_roles (user_id, role, organization_id)
  VALUES (NEW.id, 'admin', new_org_id);
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error but don't block the user creation
    RAISE WARNING 'Error in handle_new_user: %', SQLERRM;
    RAISE;
END;
$$;