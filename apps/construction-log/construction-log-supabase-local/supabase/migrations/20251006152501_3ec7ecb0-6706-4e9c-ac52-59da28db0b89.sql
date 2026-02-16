-- Optimize RLS policies for better performance according to Supabase best practices

-- 1. Add missing index on user_id column for work_reports
CREATE INDEX IF NOT EXISTS idx_work_reports_created_by_optimized ON public.work_reports (created_by) WHERE created_by IS NOT NULL;

-- 2. Temporarily disable all RLS policies on work_reports to create optimized versions
DROP POLICY IF EXISTS "Admins can delete all reports" ON public.work_reports;
DROP POLICY IF EXISTS "Admins can update all reports" ON public.work_reports;
DROP POLICY IF EXISTS "Admins can view all work reports" ON public.work_reports;
DROP POLICY IF EXISTS "Authenticated users can insert reports" ON public.work_reports;
DROP POLICY IF EXISTS "Readers cannot modify reports" ON public.work_reports;
DROP POLICY IF EXISTS "Site managers can approve reports" ON public.work_reports;
DROP POLICY IF EXISTS "Site managers can view reports by work number" ON public.work_reports;
DROP POLICY IF EXISTS "Users can delete own reports" ON public.work_reports;
DROP POLICY IF EXISTS "Users can update own reports" ON public.work_reports;
DROP POLICY IF EXISTS "Users can view assigned work reports" ON public.work_reports;

-- 3. Create optimized RLS policies using best practices (wrap functions in SELECT)

-- Allow users to view their own reports
CREATE POLICY "Users can view own reports optimized"
ON public.work_reports
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = created_by);

-- Allow users to view reports from assigned works
CREATE POLICY "Users can view assigned work reports optimized"
ON public.work_reports
FOR SELECT
TO authenticated
USING (
  (SELECT has_role(auth.uid(), 'admin'::app_role)) OR
  ((SELECT auth.uid()) = created_by) OR
  (work_id IS NOT NULL AND (SELECT has_work_access(auth.uid(), work_id)))
);

-- Allow admins to view all reports
CREATE POLICY "Admins can view all work reports optimized"
ON public.work_reports
FOR SELECT
TO authenticated
USING ((SELECT has_role(auth.uid(), 'admin'::app_role)));

-- Insert policy
CREATE POLICY "Authenticated users can insert reports optimized"
ON public.work_reports
FOR INSERT
TO authenticated
WITH CHECK ((SELECT auth.uid()) = created_by);

-- Update policies
CREATE POLICY "Users can update own reports optimized"
ON public.work_reports
FOR UPDATE
TO authenticated
USING ((SELECT auth.uid()) = created_by);

CREATE POLICY "Admins can update all reports optimized"
ON public.work_reports
FOR UPDATE
TO authenticated
USING ((SELECT has_role(auth.uid(), 'admin'::app_role)));

CREATE POLICY "Site managers can approve reports optimized"
ON public.work_reports
FOR UPDATE
TO authenticated
USING (
  (SELECT has_role(auth.uid(), 'site_manager'::app_role)) AND 
  work_id IS NOT NULL AND 
  (SELECT has_work_access(auth.uid(), work_id))
);

-- Delete policies
CREATE POLICY "Users can delete own reports optimized"
ON public.work_reports
FOR DELETE
TO authenticated
USING ((SELECT auth.uid()) = created_by);

CREATE POLICY "Admins can delete all reports optimized"
ON public.work_reports
FOR DELETE
TO authenticated
USING ((SELECT has_role(auth.uid(), 'admin'::app_role)));