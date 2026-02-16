-- Make organization name unique
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_organization_name'
  ) THEN
    ALTER TABLE public.organizations 
      ADD CONSTRAINT unique_organization_name UNIQUE (name);
  END IF;
END $$;

-- Update handle_new_user to use company name from signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_org_id UUID;
  company_name TEXT;
BEGIN
  -- Get company name from metadata
  company_name := COALESCE(
    NEW.raw_user_meta_data->>'company_name',
    NEW.raw_user_meta_data->>'full_name',
    'Mi Empresa'
  );

  -- Create new organization with company name
  INSERT INTO public.organizations (name, subscription_status, trial_end_date)
  VALUES (
    company_name,
    'trial',
    now() + interval '7 days'
  )
  RETURNING id INTO new_org_id;
  
  -- Create profile with organization
  INSERT INTO public.profiles (id, full_name, organization_id, approved)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    new_org_id,
    false
  );
  
  -- Assign admin role to first user of organization
  INSERT INTO public.user_roles (user_id, role, organization_id)
  VALUES (NEW.id, 'admin', new_org_id);
  
  RETURN NEW;
END;
$$;