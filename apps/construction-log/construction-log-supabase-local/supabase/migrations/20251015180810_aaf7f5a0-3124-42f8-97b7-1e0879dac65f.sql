-- Remove unique constraint on organization name since users should use invitation_code to join existing orgs
ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS unique_organization_name;

-- Recreate the trigger to ensure it's properly set
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Create profile for user 588512f1-45b1-4d7b-a2f3-184b00a650e6 (Pepe Flores) if missing
DO $$
DECLARE
  v_user_id UUID := '588512f1-45b1-4d7b-a2f3-184b00a650e6';
  v_org_id UUID;
  v_user_email TEXT;
  v_full_name TEXT;
BEGIN
  -- Check if profile already exists
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id)
     AND EXISTS (SELECT 1 FROM auth.users WHERE id = v_user_id) THEN
    -- Get user info from auth.users
    SELECT email, raw_user_meta_data->>'full_name' 
    INTO v_user_email, v_full_name
    FROM auth.users 
    WHERE id = v_user_id;
    
    -- Get org_id (create new one as "Pepe Flores Company")
    INSERT INTO public.organizations (name, subscription_status, trial_end_date)
    VALUES (
      COALESCE(v_full_name || ' Company', 'Nueva Empresa'),
      'trial',
      now() + interval '7 days'
    )
    RETURNING id INTO v_org_id;
    
    -- Create profile
    INSERT INTO public.profiles (
      id,
      full_name,
      organization_id,
      approved,
      email,
      last_login
    )
    VALUES (
      v_user_id,
      v_full_name,
      v_org_id,
      true,  -- Auto-approve as first user of new org
      v_user_email,
      now()
    )
    ON CONFLICT (id) DO NOTHING;
    
    -- Assign admin role
    INSERT INTO public.user_roles (user_id, role, organization_id)
    VALUES (v_user_id, 'admin'::app_role, v_org_id)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
