-- Backfill missing profiles for existing auth users and ensure trigger exists
DO $$
DECLARE
  u RECORD;
  new_org_id UUID;
BEGIN
  -- Ensure trigger exists to create profiles on new auth.users
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'auth'
      AND c.relname = 'users'
      AND t.tgname = 'on_auth_user_created'
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW
      EXECUTE FUNCTION public.handle_new_user();
  END IF;

  -- Backfill profiles for any existing auth users without profile
  FOR u IN
    SELECT au.id, au.email, au.raw_user_meta_data
    FROM auth.users au
    WHERE NOT EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = au.id
    )
  LOOP
    INSERT INTO public.organizations (name, subscription_status, trial_end_date)
    VALUES (
      COALESCE(u.raw_user_meta_data->>'full_name', 'Mi Empresa'),
      'trial',
      now() + interval '7 days'
    )
    RETURNING id INTO new_org_id;

    INSERT INTO public.profiles (id, full_name, organization_id, approved)
    VALUES (
      u.id,
      COALESCE(u.raw_user_meta_data->>'full_name', u.email),
      new_org_id,
      false
    );

    INSERT INTO public.user_roles (user_id, role, organization_id)
    VALUES (u.id, 'admin', new_org_id)
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;
