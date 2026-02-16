-- Paso 2: Crear tablas y políticas usando los nuevos roles

-- Tabla para asignar usuarios a obras específicas
CREATE TABLE IF NOT EXISTS public.work_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  work_id UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(user_id, work_id)
);

-- Habilitar RLS en work_assignments
ALTER TABLE public.work_assignments ENABLE ROW LEVEL SECURITY;

-- Políticas para work_assignments
CREATE POLICY "Admins can manage all assignments"
ON public.work_assignments
FOR ALL
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view their own assignments"
ON public.work_assignments
FOR SELECT
USING (auth.uid() = user_id);

-- Agregar campos de aprobación a work_reports
ALTER TABLE public.work_reports
ADD COLUMN IF NOT EXISTS approved BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE;

-- Función para verificar si un usuario tiene acceso a una obra
CREATE OR REPLACE FUNCTION public.has_work_access(_user_id UUID, _work_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Los admins tienen acceso a todo
  SELECT CASE 
    WHEN has_role(_user_id, 'admin') THEN TRUE
    -- Los usuarios tienen acceso si están asignados a la obra
    WHEN EXISTS (
      SELECT 1 FROM public.work_assignments
      WHERE user_id = _user_id AND work_id = _work_id
    ) THEN TRUE
    ELSE FALSE
  END;
$$;

-- Actualizar políticas de work_reports para considerar asignaciones
DROP POLICY IF EXISTS "Authenticated users can view reports" ON public.work_reports;

CREATE POLICY "Users can view assigned work reports"
ON public.work_reports
FOR SELECT
USING (
  has_role(auth.uid(), 'admin') OR 
  (work_id IS NOT NULL AND has_work_access(auth.uid(), work_id)) OR
  auth.uid() = created_by
);

-- Política para que jefes de obra puedan aprobar partes de sus obras asignadas
CREATE POLICY "Site managers can approve reports"
ON public.work_reports
FOR UPDATE
USING (
  has_role(auth.uid(), 'site_manager') AND 
  work_id IS NOT NULL AND
  has_work_access(auth.uid(), work_id)
);

-- Los usuarios con rol de solo lectura no pueden modificar nada
CREATE POLICY "Readers cannot modify reports"
ON public.work_reports
FOR UPDATE
USING (NOT has_role(auth.uid(), 'reader'));

-- Actualizar política de works para considerar asignaciones
DROP POLICY IF EXISTS "Authenticated users can view works" ON public.works;

CREATE POLICY "Users can view assigned works"
ON public.works
FOR SELECT
USING (
  has_role(auth.uid(), 'admin') OR
  has_work_access(auth.uid(), id)
);

-- Crear índices para mejorar rendimiento
CREATE INDEX IF NOT EXISTS idx_work_assignments_user_id ON public.work_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_work_assignments_work_id ON public.work_assignments(work_id);
CREATE INDEX IF NOT EXISTS idx_work_reports_work_id ON public.work_reports(work_id);
CREATE INDEX IF NOT EXISTS idx_work_reports_approved ON public.work_reports(approved);