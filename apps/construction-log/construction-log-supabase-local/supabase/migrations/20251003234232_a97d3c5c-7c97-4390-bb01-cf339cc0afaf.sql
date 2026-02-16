-- Allow site managers to create works
DROP POLICY IF EXISTS "Admins can insert works" ON public.works;
CREATE POLICY "Admins and site managers can insert works"
ON public.works
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'site_manager'));

-- Allow site managers to update works
DROP POLICY IF EXISTS "Admins can update works" ON public.works;
CREATE POLICY "Admins and site managers can update works"
ON public.works
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'site_manager'));