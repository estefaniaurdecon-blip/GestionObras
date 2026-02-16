-- Hacer el bucket work-report-images público para que las URLs no expiren
UPDATE storage.buckets 
SET public = true 
WHERE id = 'work-report-images';

-- Crear política para acceso público de lectura
CREATE POLICY "Public read access for work report images" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'work-report-images');

-- Política para que usuarios autenticados puedan subir sus propias imágenes
DROP POLICY IF EXISTS "Users can upload work report images" ON storage.objects;
CREATE POLICY "Users can upload work report images" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'work-report-images' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Política para que usuarios puedan actualizar sus propias imágenes
DROP POLICY IF EXISTS "Users can update own work report images" ON storage.objects;
CREATE POLICY "Users can update own work report images" 
ON storage.objects 
FOR UPDATE 
USING (
  bucket_id = 'work-report-images' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Política para que usuarios puedan eliminar sus propias imágenes
DROP POLICY IF EXISTS "Users can delete own work report images" ON storage.objects;
CREATE POLICY "Users can delete own work report images" 
ON storage.objects 
FOR DELETE 
USING (
  bucket_id = 'work-report-images' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);