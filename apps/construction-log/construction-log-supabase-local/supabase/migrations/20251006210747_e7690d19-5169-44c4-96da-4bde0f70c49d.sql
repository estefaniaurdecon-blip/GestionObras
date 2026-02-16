-- Crear bucket público para logos de empresa (compatible con múltiples schemas)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'storage'
      AND table_name = 'buckets'
      AND column_name = 'public'
  ) THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'company-logos',
      'company-logos',
      true,
      2097152, -- 2MB limit
      ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    )
    ON CONFLICT (id) DO NOTHING;
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'storage'
      AND table_name = 'buckets'
      AND column_name = 'is_public'
  ) THEN
    INSERT INTO storage.buckets (id, name, is_public, file_size_limit, allowed_mime_types)
    VALUES (
      'company-logos',
      'company-logos',
      true,
      2097152, -- 2MB limit
      ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    )
    ON CONFLICT (id) DO NOTHING;
  ELSE
    INSERT INTO storage.buckets (id, name)
    VALUES ('company-logos', 'company-logos')
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- Política: Los usuarios pueden ver todos los logos
CREATE POLICY "Los logos son públicos"
ON storage.objects FOR SELECT
USING (bucket_id = 'company-logos');

-- Política: Los usuarios autenticados pueden subir su propio logo
CREATE POLICY "Los usuarios pueden subir su logo"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'company-logos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Política: Los usuarios pueden actualizar su propio logo
CREATE POLICY "Los usuarios pueden actualizar su logo"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'company-logos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Política: Los usuarios pueden eliminar su propio logo
CREATE POLICY "Los usuarios pueden eliminar su logo"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'company-logos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);
