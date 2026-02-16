-- Ensure the signup trigger exists so profiles/orgs/roles are created automatically
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Backfill for any existing auth.users that are missing a profile (e.g., users created before the trigger)
DO $$
DECLARE
  r RECORD;
  target_org_id UUID;
  invitation_code_param TEXT;
  company_name TEXT;
  is_first_user BOOLEAN;
BEGIN
  FOR r IN
    SELECT u.*
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    WHERE p.id IS NULL
  LOOP
    invitation_code_param := UPPER(TRIM(COALESCE(r.raw_user_meta_data->>'invitation_code', '')));
    company_name := COALESCE(
      r.raw_user_meta_data->>'company_name',
      r.raw_user_meta_data->>'full_name',
      split_part(r.email, '@', 1)
    );

    target_org_id := NULL;
    IF invitation_code_param <> '' THEN
      SELECT id INTO target_org_id
      FROM public.organizations
      WHERE UPPER(invitation_code) = invitation_code_param
      LIMIT 1;
    END IF;

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
      r.id,
      COALESCE(r.raw_user_meta_data->>'full_name', split_part(r.email, '@', 1)),
      target_org_id,
      is_first_user,
      r.email,
      r.raw_user_meta_data->>'phone',
      r.raw_user_meta_data->>'position',
      now()
    );

    -- Assign role (admin if first user in new org, else foreman)
    INSERT INTO public.user_roles (user_id, role, organization_id)
    VALUES (
      r.id,
      CASE WHEN is_first_user THEN 'admin'::app_role ELSE 'foreman'::app_role END,
      target_org_id
    );
  END LOOP;
END $$;