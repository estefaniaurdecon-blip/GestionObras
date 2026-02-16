-- CRITICAL SECURITY FIX: Ensure works RLS policies are properly scoped to organization

-- Drop existing policies that might be too permissive
DROP POLICY IF EXISTS "Users can view works in org or assignment" ON public.works;
DROP POLICY IF EXISTS "Admins or site managers can create works" ON public.works;
DROP POLICY IF EXISTS "Admins or site managers can update works" ON public.works;
DROP POLICY IF EXISTS "Admins or site managers can delete works" ON public.works;

-- Recreate with strict organization filtering
CREATE POLICY "Users can view works in their org only"
ON public.works
FOR SELECT
USING (
  organization_id = current_user_organization()
);

CREATE POLICY "Admins or site managers can create works in their org"
ON public.works
FOR INSERT
WITH CHECK (
  organization_id = current_user_organization()
  AND (
    has_role(auth.uid(), 'admin'::app_role) 
    OR has_role(auth.uid(), 'site_manager'::app_role) 
    OR has_role(auth.uid(), 'master'::app_role)
  )
);

CREATE POLICY "Admins or site managers can update works in their org"
ON public.works
FOR UPDATE
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

CREATE POLICY "Admins or site managers can delete works in their org"
ON public.works
FOR DELETE
USING (
  organization_id = current_user_organization()
  AND (
    has_role(auth.uid(), 'admin'::app_role) 
    OR has_role(auth.uid(), 'site_manager'::app_role) 
    OR has_role(auth.uid(), 'master'::app_role)
  )
);

-- CRITICAL: Fix work_assignments to only show assignments within the organization
DROP POLICY IF EXISTS "Users can view their own assignments" ON public.work_assignments;
DROP POLICY IF EXISTS "Org admins/managers can view assignments" ON public.work_assignments;
DROP POLICY IF EXISTS "Admins and managers can insert assignments" ON public.work_assignments;
DROP POLICY IF EXISTS "Admins and managers can update assignments" ON public.work_assignments;
DROP POLICY IF EXISTS "Admins and managers can delete assignments" ON public.work_assignments;

CREATE POLICY "Users can view their org assignments only"
ON public.work_assignments
FOR SELECT
USING (
  organization_id = current_user_organization()
);

CREATE POLICY "Admins and managers can insert assignments in their org"
ON public.work_assignments
FOR INSERT
WITH CHECK (
  organization_id = current_user_organization()
  AND (
    has_role(auth.uid(), 'admin'::app_role) 
    OR has_role(auth.uid(), 'site_manager'::app_role) 
    OR has_role(auth.uid(), 'master'::app_role)
  )
);

CREATE POLICY "Admins and managers can update assignments in their org"
ON public.work_assignments
FOR UPDATE
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

CREATE POLICY "Admins and managers can delete assignments in their org"
ON public.work_assignments
FOR DELETE
USING (
  organization_id = current_user_organization()
  AND (
    has_role(auth.uid(), 'admin'::app_role) 
    OR has_role(auth.uid(), 'site_manager'::app_role) 
    OR has_role(auth.uid(), 'master'::app_role)
  )
);