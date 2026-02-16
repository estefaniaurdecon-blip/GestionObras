
-- Eliminar política existente
DROP POLICY IF EXISTS "Users can view images of accessible reports" ON public.work_report_images;

-- Nueva política: usuarios pueden ver imágenes si:
-- 1. Crearon el parte
-- 2. Están asignados a la obra del parte
-- 3. Son admin/master de la org
-- 4. Son site_manager asignado a la obra
CREATE POLICY "Users can view images of accessible reports"
ON public.work_report_images
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM work_reports wr
    WHERE wr.id = work_report_images.work_report_id
    AND (
      -- Creador del parte
      wr.created_by = auth.uid()
      OR
      -- Asignado a la obra
      (wr.work_id IS NOT NULL AND is_assigned_to_work(auth.uid(), wr.work_id))
      OR
      -- Admin o master de la organización
      (
        wr.organization_id = current_user_organization()
        AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'master'::app_role))
      )
    )
  )
);
