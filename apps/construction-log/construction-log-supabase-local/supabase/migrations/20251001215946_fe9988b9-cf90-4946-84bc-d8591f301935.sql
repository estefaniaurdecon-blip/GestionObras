-- Fix infinite recursion in RLS policies for work_assignments by removing self-referential EXISTS and using security definer helper

-- 1) Drop existing self-referential policies
DROP POLICY IF EXISTS "Site managers can assign users to their works" ON public.work_assignments;
DROP POLICY IF EXISTS "Site managers can remove assignments from their works" ON public.work_assignments;
DROP POLICY IF EXISTS "Site managers can view assignments for their works" ON public.work_assignments;

-- 2) Re-create policies using security definer function has_work_access(uid, work_id)
-- INSERT: site managers can assign if they have access to the work, admins always
CREATE POLICY "Site managers can assign users to their works"
ON public.work_assignments
FOR INSERT
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role) OR
  (
    public.has_role(auth.uid(), 'site_manager'::app_role)
    AND public.has_work_access(auth.uid(), work_assignments.work_id)
  )
);

-- DELETE: site managers can delete if they have access to the work, admins always
CREATE POLICY "Site managers can remove assignments from their works"
ON public.work_assignments
FOR DELETE
USING (
  public.has_role(auth.uid(), 'admin'::app_role) OR
  (
    public.has_role(auth.uid(), 'site_manager'::app_role)
    AND public.has_work_access(auth.uid(), work_assignments.work_id)
  )
);

-- SELECT: admins all, users their own rows, site managers rows for works they have access to
CREATE POLICY "Site managers can view assignments for their works"
ON public.work_assignments
FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin'::app_role) OR
  (auth.uid() = user_id) OR
  (
    public.has_role(auth.uid(), 'site_manager'::app_role)
    AND public.has_work_access(auth.uid(), work_assignments.work_id)
  )
);
