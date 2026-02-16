
-- Eliminar política existente
DROP POLICY IF EXISTS "Users can view images of accessible reports" ON public.work_report_images;

-- Nueva política simplificada sin usar is_assigned_to_work
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
      -- Usuario asignado a la obra (consulta directa)
      EXISTS (
        SELECT 1 FROM work_assignments wa
        WHERE wa.work_id = wr.work_id
        AND wa.user_id = auth.uid()
      )
      OR
      -- Admin o master de la organización
      (
        wr.organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
        AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'master'::app_role))
      )
    )
  )
);
