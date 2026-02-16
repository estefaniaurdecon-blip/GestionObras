-- Asegurar que existen las políticas de acceso público para el bucket app-updates
-- Primero eliminar políticas existentes si las hay para evitar duplicados
DROP POLICY IF EXISTS "Public read access for app-updates" ON storage.objects;
DROP POLICY IF EXISTS "Admin upload access for app-updates" ON storage.objects;
DROP POLICY IF EXISTS "Admin update access for app-updates" ON storage.objects;
DROP POLICY IF EXISTS "Admin delete access for app-updates" ON storage.objects;

-- Política de lectura pública (cualquiera puede descargar actualizaciones)
CREATE POLICY "Public read access for app-updates"
ON storage.objects FOR SELECT
USING (bucket_id = 'app-updates');

-- Política de subida solo para admins autenticados
CREATE POLICY "Admin upload access for app-updates"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'app-updates' 
  AND auth.role() = 'authenticated'
  AND EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'master')
  )
);

-- Política de actualización solo para admins
CREATE POLICY "Admin update access for app-updates"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'app-updates' 
  AND auth.role() = 'authenticated'
  AND EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'master')
  )
);

-- Política de eliminación solo para admins
CREATE POLICY "Admin delete access for app-updates"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'app-updates' 
  AND auth.role() = 'authenticated'
  AND EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'master')
  )
);