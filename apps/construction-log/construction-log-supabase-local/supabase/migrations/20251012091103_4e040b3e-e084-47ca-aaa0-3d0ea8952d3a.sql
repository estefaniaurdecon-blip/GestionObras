-- =====================================================
-- MULTI-TENANCY IMPLEMENTATION - PART 2: CREATE TABLES AND FUNCTIONS
-- =====================================================

-- 1. Create organizations table
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  subscription_status TEXT DEFAULT 'trial',
  trial_end_date TIMESTAMPTZ DEFAULT (now() + interval '7 days'),
  subscription_end_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- 2. Add organization_id to profiles (nullable first, will set NOT NULL after migration)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- 3. Add organization_id to all main tables
ALTER TABLE public.works ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.work_reports ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.shared_files ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.saved_economic_reports ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.work_assignments ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- 4. Create helper function to check same organization
CREATE OR REPLACE FUNCTION public.same_organization(target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM profiles p1, profiles p2
    WHERE p1.id = auth.uid() 
      AND p2.id = target_user_id
      AND p1.organization_id = p2.organization_id
      AND p1.organization_id IS NOT NULL
  )
$$;

-- 5. Create helper function to get current user's organization
CREATE OR REPLACE FUNCTION public.current_user_organization()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM profiles WHERE id = auth.uid()
$$;

-- 6. Migrate existing data - create one organization per existing user
DO $$
DECLARE
  user_record RECORD;
  new_org_id UUID;
BEGIN
  FOR user_record IN SELECT id, full_name FROM profiles WHERE organization_id IS NULL
  LOOP
    -- Create organization for this user
    INSERT INTO organizations (name, subscription_status, trial_end_date)
    VALUES (
      COALESCE(user_record.full_name, 'Mi Empresa') || ' - Organización',
      'trial',
      now() + interval '7 days'
    )
    RETURNING id INTO new_org_id;
    
    -- Assign user to organization
    UPDATE profiles SET organization_id = new_org_id WHERE id = user_record.id;
    
    -- Migrate user's data to organization
    UPDATE works SET organization_id = new_org_id WHERE created_by = user_record.id;
    UPDATE work_reports SET organization_id = new_org_id WHERE created_by = user_record.id;
    UPDATE messages SET organization_id = new_org_id WHERE from_user_id = user_record.id OR to_user_id = user_record.id;
    UPDATE shared_files SET organization_id = new_org_id WHERE from_user_id = user_record.id OR to_user_id = user_record.id;
    UPDATE notifications SET organization_id = new_org_id WHERE user_id = user_record.id;
    UPDATE saved_economic_reports SET organization_id = new_org_id WHERE saved_by = user_record.id;
    UPDATE company_settings SET organization_id = new_org_id WHERE user_id = user_record.id;
    UPDATE user_roles SET organization_id = new_org_id WHERE user_id = user_record.id;
    
    -- Migrate work_assignments for works this user created
    UPDATE work_assignments wa
    SET organization_id = new_org_id
    FROM works w
    WHERE wa.work_id = w.id AND w.created_by = user_record.id;
  END LOOP;
END $$;

-- 7. Make organization_id NOT NULL after migration
ALTER TABLE public.profiles ALTER COLUMN organization_id SET NOT NULL;

-- 8. Update trigger for new users - create organization automatically
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_org_id UUID;
BEGIN
  -- Create new organization for the user
  INSERT INTO public.organizations (name, subscription_status, trial_end_date)
  VALUES (
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Mi Empresa'),
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