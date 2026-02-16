-- Crear tabla para versiones de la aplicación
CREATE TABLE IF NOT EXISTS public.app_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  version TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL CHECK (platform IN ('windows', 'android', 'web')),
  file_url TEXT,
  file_size BIGINT,
  release_notes TEXT,
  is_mandatory BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  published_by UUID REFERENCES auth.users(id)
);

-- Habilitar RLS
ALTER TABLE public.app_versions ENABLE ROW LEVEL SECURITY;

-- Política: todos pueden ver versiones publicadas
CREATE POLICY "Anyone can view published versions"
  ON public.app_versions
  FOR SELECT
  USING (true);

-- Política: solo admins pueden insertar versiones
CREATE POLICY "Only admins can insert versions"
  ON public.app_versions
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Política: solo admins pueden actualizar versiones
CREATE POLICY "Only admins can update versions"
  ON public.app_versions
  FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Política: solo admins pueden eliminar versiones
CREATE POLICY "Only admins can delete versions"
  ON public.app_versions
  FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Crear bucket de storage para archivos de actualización (compatible con múltiples schemas)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'storage'
      AND table_name = 'buckets'
      AND column_name = 'public'
  ) THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('app-updates', 'app-updates', true)
    ON CONFLICT (id) DO NOTHING;
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'storage'
      AND table_name = 'buckets'
      AND column_name = 'is_public'
  ) THEN
    INSERT INTO storage.buckets (id, name, is_public)
    VALUES ('app-updates', 'app-updates', true)
    ON CONFLICT (id) DO NOTHING;
  ELSE
    INSERT INTO storage.buckets (id, name)
    VALUES ('app-updates', 'app-updates')
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- Políticas de storage para el bucket
CREATE POLICY "Anyone can download update files"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'app-updates');

CREATE POLICY "Only admins can upload update files"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'app-updates' 
    AND has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Only admins can delete update files"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'app-updates' 
    AND has_role(auth.uid(), 'admin'::app_role)
  );

-- Índice para búsquedas rápidas
CREATE INDEX idx_app_versions_platform ON public.app_versions(platform);
CREATE INDEX idx_app_versions_created_at ON public.app_versions(created_at DESC);
