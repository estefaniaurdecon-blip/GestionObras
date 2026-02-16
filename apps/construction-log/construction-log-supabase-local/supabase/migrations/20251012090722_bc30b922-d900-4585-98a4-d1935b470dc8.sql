-- =====================================================
-- MULTI-TENANCY IMPLEMENTATION FOR TASKREPORT PRO
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

-- 9. RLS Policies for organizations table
DROP POLICY IF EXISTS "Users can view their organization" ON public.organizations;
CREATE POLICY "Users can view their organization"
ON public.organizations FOR SELECT
USING (id = current_user_organization());

DROP POLICY IF EXISTS "Admins can update their organization" ON public.organizations;
CREATE POLICY "Admins can update their organization"
ON public.organizations FOR UPDATE
USING (
  id = current_user_organization() 
  AND has_role(auth.uid(), 'admin'::app_role)
);

-- 10. Update RLS policies for profiles
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view org profiles"
ON public.profiles FOR SELECT
USING (
  organization_id = current_user_organization()
  AND has_role(auth.uid(), 'admin'::app_role)
);

DROP POLICY IF EXISTS "Site managers can view assignable users" ON public.profiles;
CREATE POLICY "Site managers can view org assignable users"
ON public.profiles FOR SELECT
USING (
  approved = true
  AND organization_id = current_user_organization()
  AND (has_role(auth.uid(), 'site_manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  AND (has_role(id, 'foreman'::app_role) OR has_role(id, 'site_manager'::app_role) OR has_role(id, 'admin'::app_role))
);

DROP POLICY IF EXISTS "Site managers can view assigned users" ON public.profiles;
CREATE POLICY "Site managers can view org assigned users"
ON public.profiles FOR SELECT
USING (
  has_role(auth.uid(), 'site_manager'::app_role)
  AND approved = true
  AND organization_id = current_user_organization()
  AND EXISTS (
    SELECT 1 FROM work_assignments wa1
    JOIN work_assignments wa2 ON wa1.work_id = wa2.work_id
    WHERE wa1.user_id = auth.uid() AND wa2.user_id = profiles.id
  )
);

DROP POLICY IF EXISTS "Admins can update profiles" ON public.profiles;
CREATE POLICY "Admins can update org profiles"
ON public.profiles FOR UPDATE
USING (
  organization_id = current_user_organization()
  AND has_role(auth.uid(), 'admin'::app_role)
);

DROP POLICY IF EXISTS "Admins can delete profiles" ON public.profiles;
CREATE POLICY "Admins can delete org profiles"
ON public.profiles FOR DELETE
USING (
  organization_id = current_user_organization()
  AND has_role(auth.uid(), 'admin'::app_role)
);

-- 11. Update RLS policies for user_roles
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
CREATE POLICY "Admins can view org roles"
ON public.user_roles FOR SELECT
USING (
  organization_id = current_user_organization()
  AND has_role(auth.uid(), 'admin'::app_role)
);

DROP POLICY IF EXISTS "Site managers can view user roles" ON public.user_roles;
CREATE POLICY "Site managers can view org user roles"
ON public.user_roles FOR SELECT
USING (
  organization_id = current_user_organization()
  AND (has_role(auth.uid(), 'site_manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
);

DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
CREATE POLICY "Admins can insert org roles"
ON public.user_roles FOR INSERT
WITH CHECK (
  organization_id = current_user_organization()
  AND has_role(auth.uid(), 'admin'::app_role)
);

DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
CREATE POLICY "Admins can update org roles"
ON public.user_roles FOR UPDATE
USING (
  organization_id = current_user_organization()
  AND has_role(auth.uid(), 'admin'::app_role)
);

DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
CREATE POLICY "Admins can delete org roles"
ON public.user_roles FOR DELETE
USING (
  organization_id = current_user_organization()
  AND has_role(auth.uid(), 'admin'::app_role)
);

-- 12. Update RLS policies for works
DROP POLICY IF EXISTS "Admins and site managers can insert works" ON public.works;
CREATE POLICY "Admins and site managers can insert org works"
ON public.works FOR INSERT
WITH CHECK (
  organization_id = current_user_organization()
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'site_manager'::app_role))
);

DROP POLICY IF EXISTS "Admins and site managers can update works" ON public.works;
CREATE POLICY "Admins and site managers can update org works"
ON public.works FOR UPDATE
USING (
  organization_id = current_user_organization()
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'site_manager'::app_role))
);

DROP POLICY IF EXISTS "Users can view assigned works" ON public.works;
CREATE POLICY "Users can view org assigned works"
ON public.works FOR SELECT
USING (
  organization_id = current_user_organization()
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_work_access(auth.uid(), id))
);

-- 13. Update RLS policies for work_reports
DROP POLICY IF EXISTS "Admins can view all work reports optimized" ON public.work_reports;
CREATE POLICY "Admins can view org work reports"
ON public.work_reports FOR SELECT
USING (
  organization_id = current_user_organization()
  AND has_role(auth.uid(), 'admin'::app_role)
);

DROP POLICY IF EXISTS "Users can view assigned work reports optimized" ON public.work_reports;
DROP POLICY IF EXISTS "Users can view own reports optimized" ON public.work_reports;
CREATE POLICY "Users can view org work reports"
ON public.work_reports FOR SELECT
USING (
  organization_id = current_user_organization()
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR auth.uid() = created_by
    OR (work_id IS NOT NULL AND has_work_access(auth.uid(), work_id))
  )
);

DROP POLICY IF EXISTS "Authenticated users can insert reports optimized" ON public.work_reports;
CREATE POLICY "Users can insert org reports"
ON public.work_reports FOR INSERT
WITH CHECK (
  organization_id = current_user_organization()
  AND auth.uid() = created_by
);

DROP POLICY IF EXISTS "Users can update own reports optimized" ON public.work_reports;
DROP POLICY IF EXISTS "Site managers can approve reports optimized" ON public.work_reports;
DROP POLICY IF EXISTS "Admins can update all reports optimized" ON public.work_reports;
CREATE POLICY "Users can update org reports"
ON public.work_reports FOR UPDATE
USING (
  organization_id = current_user_organization()
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR auth.uid() = created_by
    OR (has_role(auth.uid(), 'site_manager'::app_role) AND work_id IS NOT NULL AND has_work_access(auth.uid(), work_id))
  )
);

DROP POLICY IF EXISTS "Users can delete own reports optimized" ON public.work_reports;
DROP POLICY IF EXISTS "Admins can delete all reports optimized" ON public.work_reports;
CREATE POLICY "Users can delete org reports"
ON public.work_reports FOR DELETE
USING (
  organization_id = current_user_organization()
  AND (has_role(auth.uid(), 'admin'::app_role) OR auth.uid() = created_by)
);

-- 14. Update RLS policies for messages
DROP POLICY IF EXISTS "Users can view their messages" ON public.messages;
CREATE POLICY "Users can view org messages"
ON public.messages FOR SELECT
USING (
  organization_id = current_user_organization()
  AND (auth.uid() = from_user_id OR auth.uid() = to_user_id)
);

DROP POLICY IF EXISTS "Approved users can send messages to approved users" ON public.messages;
CREATE POLICY "Users can send org messages"
ON public.messages FOR INSERT
WITH CHECK (
  organization_id = current_user_organization()
  AND auth.uid() = from_user_id
  AND same_organization(to_user_id)
);

DROP POLICY IF EXISTS "Users can update their received messages" ON public.messages;
CREATE POLICY "Users can update org messages"
ON public.messages FOR UPDATE
USING (
  organization_id = current_user_organization()
  AND auth.uid() = to_user_id
);

DROP POLICY IF EXISTS "Users can delete their messages" ON public.messages;
CREATE POLICY "Users can delete org messages"
ON public.messages FOR DELETE
USING (
  organization_id = current_user_organization()
  AND (auth.uid() = from_user_id OR auth.uid() = to_user_id)
);

-- 15. Update RLS policies for other tables (similar pattern)
DROP POLICY IF EXISTS "Users can view their shared files" ON public.shared_files;
CREATE POLICY "Users can view org shared files"
ON public.shared_files FOR SELECT
USING (
  organization_id = current_user_organization()
  AND (auth.uid() = from_user_id OR auth.uid() = to_user_id)
);

DROP POLICY IF EXISTS "Users can share files" ON public.shared_files;
CREATE POLICY "Users can share org files"
ON public.shared_files FOR INSERT
WITH CHECK (
  organization_id = current_user_organization()
  AND auth.uid() = from_user_id
  AND same_organization(to_user_id)
);

DROP POLICY IF EXISTS "Users can update received files" ON public.shared_files;
CREATE POLICY "Users can update org files"
ON public.shared_files FOR UPDATE
USING (
  organization_id = current_user_organization()
  AND auth.uid() = to_user_id
);

DROP POLICY IF EXISTS "Users can delete sent files" ON public.shared_files;
DROP POLICY IF EXISTS "Users can delete received files" ON public.shared_files;
CREATE POLICY "Users can delete org files"
ON public.shared_files FOR DELETE
USING (
  organization_id = current_user_organization()
  AND (auth.uid() = from_user_id OR auth.uid() = to_user_id)
);

-- Notifications
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
CREATE POLICY "Users can view org notifications"
ON public.notifications FOR SELECT
USING (
  organization_id = current_user_organization()
  AND auth.uid() = user_id
);

DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
CREATE POLICY "Users can update org notifications"
ON public.notifications FOR UPDATE
USING (
  organization_id = current_user_organization()
  AND auth.uid() = user_id
);

DROP POLICY IF EXISTS "Users can delete their own notifications" ON public.notifications;
CREATE POLICY "Users can delete org notifications"
ON public.notifications FOR DELETE
USING (
  organization_id = current_user_organization()
  AND auth.uid() = user_id
);

-- Saved economic reports
DROP POLICY IF EXISTS "Admins can view all saved economic reports" ON public.saved_economic_reports;
CREATE POLICY "Admins can view org saved reports"
ON public.saved_economic_reports FOR SELECT
USING (
  organization_id = current_user_organization()
  AND has_role(auth.uid(), 'admin'::app_role)
);

DROP POLICY IF EXISTS "Site managers can view their saved economic reports" ON public.saved_economic_reports;
CREATE POLICY "Site managers can view org saved reports"
ON public.saved_economic_reports FOR SELECT
USING (
  organization_id = current_user_organization()
  AND has_role(auth.uid(), 'site_manager'::app_role)
  AND EXISTS (
    SELECT 1 FROM work_reports wr
    JOIN work_assignments wa ON wa.work_id = wr.work_id
    WHERE wr.id = saved_economic_reports.work_report_id 
      AND wa.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Admins and site managers can insert saved economic reports" ON public.saved_economic_reports;
CREATE POLICY "Managers can insert org saved reports"
ON public.saved_economic_reports FOR INSERT
WITH CHECK (
  organization_id = current_user_organization()
  AND auth.uid() = saved_by
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'site_manager'::app_role))
);

DROP POLICY IF EXISTS "Admins can delete saved economic reports" ON public.saved_economic_reports;
CREATE POLICY "Admins can delete org saved reports"
ON public.saved_economic_reports FOR DELETE
USING (
  organization_id = current_user_organization()
  AND has_role(auth.uid(), 'admin'::app_role)
);

-- Company settings
DROP POLICY IF EXISTS "Users can view own settings" ON public.company_settings;
CREATE POLICY "Users can view org settings"
ON public.company_settings FOR SELECT
USING (
  organization_id = current_user_organization()
);

DROP POLICY IF EXISTS "Users can insert own settings" ON public.company_settings;
CREATE POLICY "Users can insert org settings"
ON public.company_settings FOR INSERT
WITH CHECK (
  organization_id = current_user_organization()
  AND auth.uid() = user_id
);

DROP POLICY IF EXISTS "Users can update own settings" ON public.company_settings;
CREATE POLICY "Users can update org settings"
ON public.company_settings FOR UPDATE
USING (
  organization_id = current_user_organization()
  AND auth.uid() = user_id
);

-- Work assignments
DROP POLICY IF EXISTS "Admins can manage all assignments" ON public.work_assignments;
CREATE POLICY "Admins can manage org assignments"
ON public.work_assignments FOR ALL
USING (
  organization_id = current_user_organization()
  AND has_role(auth.uid(), 'admin'::app_role)
);

DROP POLICY IF EXISTS "Site managers can view assignments for their works" ON public.work_assignments;
DROP POLICY IF EXISTS "Users can view their own assignments" ON public.work_assignments;
CREATE POLICY "Users can view org assignments"
ON public.work_assignments FOR SELECT
USING (
  organization_id = current_user_organization()
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR auth.uid() = user_id
    OR (has_role(auth.uid(), 'site_manager'::app_role) AND has_work_access(auth.uid(), work_id))
  )
);

DROP POLICY IF EXISTS "Site managers can assign users to their works" ON public.work_assignments;
CREATE POLICY "Managers can assign org users"
ON public.work_assignments FOR INSERT
WITH CHECK (
  organization_id = current_user_organization()
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR (has_role(auth.uid(), 'site_manager'::app_role) AND has_work_access(auth.uid(), work_id))
  )
  AND same_organization(user_id)
);

DROP POLICY IF EXISTS "Site managers can remove assignments from their works" ON public.work_assignments;
CREATE POLICY "Managers can remove org assignments"
ON public.work_assignments FOR DELETE
USING (
  organization_id = current_user_organization()
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR (has_role(auth.uid(), 'site_manager'::app_role) AND has_work_access(auth.uid(), work_id))
  )
);

-- Work report comments
DROP POLICY IF EXISTS "Users can view comments on their assigned work reports" ON public.work_report_comments;
CREATE POLICY "Users can view org comments"
ON public.work_report_comments FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM work_reports
    WHERE work_reports.id = work_report_comments.work_report_id
      AND work_reports.organization_id = current_user_organization()
      AND (
        auth.uid() = work_reports.created_by
        OR has_role(auth.uid(), 'admin'::app_role)
        OR (work_reports.work_id IS NOT NULL AND has_work_access(auth.uid(), work_reports.work_id))
      )
  )
);

DROP POLICY IF EXISTS "Users can create comments on accessible work reports" ON public.work_report_comments;
CREATE POLICY "Users can create org comments"
ON public.work_report_comments FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM work_reports
    WHERE work_reports.id = work_report_comments.work_report_id
      AND work_reports.organization_id = current_user_organization()
      AND (
        auth.uid() = work_reports.created_by
        OR has_role(auth.uid(), 'admin'::app_role)
        OR (work_reports.work_id IS NOT NULL AND has_work_access(auth.uid(), work_reports.work_id))
      )
  )
);