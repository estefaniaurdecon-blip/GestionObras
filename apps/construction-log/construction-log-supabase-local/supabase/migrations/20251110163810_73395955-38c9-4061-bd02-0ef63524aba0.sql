-- Agregar work_id a access_control_reports para vincular controles con obras específicas
ALTER TABLE public.access_control_reports 
ADD COLUMN work_id uuid REFERENCES public.works(id) ON DELETE CASCADE;

-- Crear índice para mejorar rendimiento de consultas por obra
CREATE INDEX idx_access_control_reports_work_id ON public.access_control_reports(work_id);

-- Actualizar políticas RLS para access_control_reports
DROP POLICY IF EXISTS "Users can view access reports in their org" ON public.access_control_reports;
DROP POLICY IF EXISTS "Users can create access reports in their org" ON public.access_control_reports;
DROP POLICY IF EXISTS "Owners or admins can update access reports" ON public.access_control_reports;
DROP POLICY IF EXISTS "Owners or admins can delete access reports" ON public.access_control_reports;

-- SELECT: Foreman puede ver solo los de sus obras asignadas, admins/site_manager/master ven todos
CREATE POLICY "Users can view access reports based on work assignment"
ON public.access_control_reports
FOR SELECT
TO authenticated
USING (
  organization_id = current_user_organization() AND (
    created_by = auth.uid() 
    OR has_role(auth.uid(), 'admin'::app_role) 
    OR has_role(auth.uid(), 'master'::app_role)
    OR has_role(auth.uid(), 'site_manager'::app_role)
    OR (work_id IS NOT NULL AND is_assigned_to_work(auth.uid(), work_id))
  )
);

-- INSERT: Cualquier usuario autenticado puede crear en su org si está asignado a la obra
CREATE POLICY "Users can create access reports for assigned works"
ON public.access_control_reports
FOR INSERT
TO authenticated
WITH CHECK (
  organization_id = current_user_organization() 
  AND created_by = auth.uid()
  AND (
    work_id IS NULL
    OR is_assigned_to_work(auth.uid(), work_id)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'master'::app_role)
    OR has_role(auth.uid(), 'site_manager'::app_role)
  )
);

-- UPDATE: Solo el creador o admins/managers pueden actualizar
CREATE POLICY "Owners or admins can update access reports"
ON public.access_control_reports
FOR UPDATE
TO authenticated
USING (
  organization_id = current_user_organization() AND (
    created_by = auth.uid() 
    OR has_role(auth.uid(), 'admin'::app_role) 
    OR has_role(auth.uid(), 'site_manager'::app_role) 
    OR has_role(auth.uid(), 'master'::app_role)
  )
)
WITH CHECK (
  organization_id = current_user_organization() AND (
    created_by = auth.uid() 
    OR has_role(auth.uid(), 'admin'::app_role) 
    OR has_role(auth.uid(), 'site_manager'::app_role) 
    OR has_role(auth.uid(), 'master'::app_role)
  )
);

-- DELETE: Solo el creador o admins/managers pueden eliminar
CREATE POLICY "Owners or admins can delete access reports"
ON public.access_control_reports
FOR DELETE
TO authenticated
USING (
  organization_id = current_user_organization() AND (
    created_by = auth.uid() 
    OR has_role(auth.uid(), 'admin'::app_role) 
    OR has_role(auth.uid(), 'site_manager'::app_role) 
    OR has_role(auth.uid(), 'master'::app_role)
  )
);

-- Actualizar políticas RLS para company_portfolio para dar acceso a foreman
DROP POLICY IF EXISTS "Authorized roles can view portfolio" ON public.company_portfolio;
DROP POLICY IF EXISTS "Users can update companies in their org" ON public.company_portfolio;

-- SELECT: Foreman y superiores pueden ver toda la cartera de su org
CREATE POLICY "Org users can view portfolio"
ON public.company_portfolio
FOR SELECT
TO authenticated
USING (
  organization_id = current_user_organization() AND (
    has_role(auth.uid(), 'master'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'site_manager'::app_role)
    OR has_role(auth.uid(), 'foreman'::app_role)
  )
);

-- UPDATE: Solo el creador puede editar sus propias entradas, o admins/managers pueden editar todas
CREATE POLICY "Users can update their own companies or admins can update all"
ON public.company_portfolio
FOR UPDATE
TO authenticated
USING (
  organization_id = current_user_organization() AND (
    created_by = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'master'::app_role)
    OR has_role(auth.uid(), 'site_manager'::app_role)
  )
)
WITH CHECK (
  organization_id = current_user_organization() AND (
    created_by = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'master'::app_role)
    OR has_role(auth.uid(), 'site_manager'::app_role)
  )
);