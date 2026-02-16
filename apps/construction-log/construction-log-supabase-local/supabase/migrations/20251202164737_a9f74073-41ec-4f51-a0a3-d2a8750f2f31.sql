
-- Eliminar política existente
DROP POLICY IF EXISTS "Org users can view work report images" ON storage.objects;

-- Crear política simplificada - cualquier usuario autenticado de la org puede ver
CREATE POLICY "Org users can view work report images"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'work-report-images' 
  AND auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.organization_id IS NOT NULL
  )
);
