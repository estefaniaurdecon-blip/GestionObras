-- =============================================
-- MIGRACIÓN DE SEGURIDAD: Restringir app_versions
-- =============================================

-- 1. Eliminar la política pública existente
DROP POLICY IF EXISTS "Anyone can view app versions" ON public.app_versions;

-- 2. Crear nueva política que solo permite lectura a usuarios autenticados
CREATE POLICY "Authenticated users can view app versions" 
ON public.app_versions 
FOR SELECT 
TO authenticated 
USING (true);

-- 3. Asegurar que RLS está habilitado
ALTER TABLE public.app_versions ENABLE ROW LEVEL SECURITY;