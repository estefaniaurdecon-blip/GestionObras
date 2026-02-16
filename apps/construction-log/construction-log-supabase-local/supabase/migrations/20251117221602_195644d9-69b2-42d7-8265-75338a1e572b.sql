-- Crear tabla para asignaciones de operadores a maquinaria de alquiler por fecha
CREATE TABLE IF NOT EXISTS public.work_rental_machinery_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rental_machinery_id UUID NOT NULL REFERENCES public.work_rental_machinery(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  work_id UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  assignment_date DATE NOT NULL,
  operator_name TEXT NOT NULL,
  company_name TEXT NOT NULL,
  activity TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(rental_machinery_id, assignment_date)
);

-- Índices para mejorar rendimiento
CREATE INDEX idx_rental_machinery_assignments_rental_id ON public.work_rental_machinery_assignments(rental_machinery_id);
CREATE INDEX idx_rental_machinery_assignments_date ON public.work_rental_machinery_assignments(assignment_date);
CREATE INDEX idx_rental_machinery_assignments_work_id ON public.work_rental_machinery_assignments(work_id);

-- Habilitar RLS
ALTER TABLE public.work_rental_machinery_assignments ENABLE ROW LEVEL SECURITY;

-- Política para ver asignaciones
CREATE POLICY "Users can view assignments in their org"
ON public.work_rental_machinery_assignments
FOR SELECT
USING (
  organization_id = current_user_organization() AND
  (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'master'::app_role) OR
    has_role(auth.uid(), 'site_manager'::app_role) OR
    EXISTS (
      SELECT 1 FROM work_assignments wa
      WHERE wa.work_id = work_rental_machinery_assignments.work_id
      AND wa.user_id = auth.uid()
    )
  )
);

-- Política para crear asignaciones
CREATE POLICY "Admins and managers can insert assignments"
ON public.work_rental_machinery_assignments
FOR INSERT
WITH CHECK (
  organization_id = current_user_organization() AND
  (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'master'::app_role) OR
    has_role(auth.uid(), 'site_manager'::app_role)
  )
);

-- Política para actualizar asignaciones
CREATE POLICY "Admins and managers can update assignments"
ON public.work_rental_machinery_assignments
FOR UPDATE
USING (
  organization_id = current_user_organization() AND
  (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'master'::app_role) OR
    has_role(auth.uid(), 'site_manager'::app_role)
  )
)
WITH CHECK (
  organization_id = current_user_organization() AND
  (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'master'::app_role) OR
    has_role(auth.uid(), 'site_manager'::app_role)
  )
);

-- Política para eliminar asignaciones
CREATE POLICY "Admins and managers can delete assignments"
ON public.work_rental_machinery_assignments
FOR DELETE
USING (
  organization_id = current_user_organization() AND
  (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'master'::app_role) OR
    has_role(auth.uid(), 'site_manager'::app_role)
  )
);

-- Trigger para actualizar updated_at
CREATE TRIGGER update_rental_machinery_assignments_updated_at
BEFORE UPDATE ON public.work_rental_machinery_assignments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();