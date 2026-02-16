-- Eliminar políticas existentes del bucket work-report-images si existen
DROP POLICY IF EXISTS "Users can upload images to their reports" ON storage.objects;
DROP POLICY IF EXISTS "Users can view images of accessible reports" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own images" ON storage.objects;
DROP POLICY IF EXISTS "Org users can view work report images" ON storage.objects;

-- Política para subir imágenes (solo el creador del parte)
CREATE POLICY "Users can upload work report images"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'work-report-images' 
  AND auth.uid() IS NOT NULL
);

-- Política para ver imágenes - usuarios de la misma organización pueden ver
CREATE POLICY "Org users can view work report images"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'work-report-images' 
  AND auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.organization_id = current_user_organization()
  )
);

-- Política para eliminar imágenes - solo admins/site_managers o el creador
CREATE POLICY "Users can delete work report images"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'work-report-images'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'master'::app_role)
    OR has_role(auth.uid(), 'site_manager'::app_role)
  )
);