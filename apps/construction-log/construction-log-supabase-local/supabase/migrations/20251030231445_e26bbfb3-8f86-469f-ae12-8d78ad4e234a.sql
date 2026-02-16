-- EMERGENCIA: Fortalecer políticas RLS para aislamiento total entre organizaciones
-- Eliminar y recrear políticas de work_reports con filtros más estrictos

-- 1. Eliminar políticas existentes de work_reports
DROP POLICY IF EXISTS "Users can view reports in their organization" ON public.work_reports;
DROP POLICY IF EXISTS "Users can create their own reports in org" ON public.work_reports;
DROP POLICY IF EXISTS "Owners or admins can update reports in org" ON public.work_reports;
DROP POLICY IF EXISTS "Owners or admins can delete reports in org" ON public.work_reports;
DROP POLICY IF EXISTS "Ofi role can view approved and signed reports" ON public.work_reports;

-- 2. Crear políticas MÁS ESTRICTAS con validación explícita de organization_id

-- SELECT: Solo ver partes de tu organización
CREATE POLICY "Users can view reports in their organization STRICT" 
ON public.work_reports 
FOR SELECT 
USING (
  organization_id IS NOT NULL 
  AND organization_id = current_user_organization()
  AND (
    created_by = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'master'::app_role)
    OR (has_role(auth.uid(), 'site_manager'::app_role) AND status = 'completed')
    OR (has_role(auth.uid(), 'foreman'::app_role) AND work_id IS NOT NULL AND is_assigned_to_work(auth.uid(), work_id))
    OR (work_id IS NOT NULL AND is_assigned_to_work(auth.uid(), work_id))
  )
);

-- INSERT: Solo crear partes en tu organización
CREATE POLICY "Users can create reports in their org STRICT" 
ON public.work_reports 
FOR INSERT 
WITH CHECK (
  organization_id IS NOT NULL
  AND organization_id = current_user_organization()
  AND created_by = auth.uid()
  AND (
    work_id IS NULL
    OR (work_id IS NOT NULL AND is_assigned_to_work(auth.uid(), work_id))
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'site_manager'::app_role)
    OR has_role(auth.uid(), 'master'::app_role)
  )
);

-- UPDATE: Solo actualizar partes de tu organización
CREATE POLICY "Owners or admins can update reports STRICT" 
ON public.work_reports 
FOR UPDATE 
USING (
  organization_id IS NOT NULL
  AND organization_id = current_user_organization()
  AND (
    created_by = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'site_manager'::app_role)
    OR has_role(auth.uid(), 'master'::app_role)
  )
)
WITH CHECK (
  organization_id IS NOT NULL
  AND organization_id = current_user_organization()
  AND (
    created_by = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'site_manager'::app_role)
    OR has_role(auth.uid(), 'master'::app_role)
  )
);

-- DELETE: Solo eliminar partes de tu organización
CREATE POLICY "Owners or admins can delete reports STRICT" 
ON public.work_reports 
FOR DELETE 
USING (
  organization_id IS NOT NULL
  AND organization_id = current_user_organization()
  AND (
    created_by = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'site_manager'::app_role)
    OR has_role(auth.uid(), 'master'::app_role)
  )
);

-- OFI: Solo ver partes aprobados y firmados de tu organización
CREATE POLICY "Ofi can view approved signed reports STRICT" 
ON public.work_reports 
FOR SELECT 
USING (
  organization_id IS NOT NULL
  AND organization_id = current_user_organization()
  AND approved = true
  AND site_manager_signature IS NOT NULL
  AND has_role(auth.uid(), 'ofi'::app_role)
);

-- 3. Asegurar que organization_id NO puede ser NULL en nuevos registros
ALTER TABLE public.work_reports ALTER COLUMN organization_id SET NOT NULL;