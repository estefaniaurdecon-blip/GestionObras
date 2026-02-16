-- Add invitation code to organizations and fix case-insensitive matching
ALTER TABLE public.organizations 
ADD COLUMN IF NOT EXISTS invitation_code TEXT UNIQUE;

-- Generate unique invitation codes for existing organizations
UPDATE public.organizations 
SET invitation_code = UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 8))
WHERE invitation_code IS NULL;

-- Make invitation_code required for new organizations
ALTER TABLE public.organizations 
ALTER COLUMN invitation_code SET DEFAULT UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 8));

-- Update handle_new_user to support invitation codes and case-insensitive org matching
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Try to find existing organization by invitation code (case-insensitive)
  IF invitation_code_param != '' THEN
    SELECT id INTO target_org_id
    FROM public.organizations
    WHERE UPPER(invitation_code) = invitation_code_param
    LIMIT 1;
  END IF;

  -- If no organization found by code, try by company name (case-insensitive)
  IF target_org_id IS NULL AND company_name IS NOT NULL THEN
    SELECT id INTO target_org_id
    FROM public.organizations
    WHERE LOWER(TRIM(name)) = LOWER(TRIM(company_name))
    LIMIT 1;
  END IF;

  -- If still no organization found, create a new one
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
$$;