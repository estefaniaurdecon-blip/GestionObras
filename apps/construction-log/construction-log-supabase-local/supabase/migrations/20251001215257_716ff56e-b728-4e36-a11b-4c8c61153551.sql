-- Permitir que los site managers gestionen asignaciones en sus obras
DROP POLICY IF EXISTS "Site managers can assign users to their works" ON public.work_assignments;
CREATE POLICY "Site managers can assign users to their works"
ON public.work_assignments
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR
  (has_role(auth.uid(), 'site_manager'::app_role) AND 
   EXISTS (
     SELECT 1 FROM public.work_assignments wa
     WHERE wa.work_id = work_assignments.work_id
     AND wa.user_id = auth.uid()
   ))
);

-- Permitir que los site managers eliminen asignaciones en sus obras
DROP POLICY IF EXISTS "Site managers can remove assignments from their works" ON public.work_assignments;
CREATE POLICY "Site managers can remove assignments from their works"
ON public.work_assignments
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR
  (has_role(auth.uid(), 'site_manager'::app_role) AND 
   EXISTS (
     SELECT 1 FROM public.work_assignments wa
     WHERE wa.work_id = work_assignments.work_id
     AND wa.user_id = auth.uid()
   ))
);

-- Permitir que site managers vean todas las asignaciones de sus obras
DROP POLICY IF EXISTS "Site managers can view assignments for their works" ON public.work_assignments;
CREATE POLICY "Site managers can view assignments for their works"
ON public.work_assignments
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR
  auth.uid() = user_id OR
  (has_role(auth.uid(), 'site_manager'::app_role) AND 
   EXISTS (
     SELECT 1 FROM public.work_assignments wa
     WHERE wa.work_id = work_assignments.work_id
     AND wa.user_id = auth.uid()
   ))
);