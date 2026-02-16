-- Crear tabla para maquinaria de alquiler de obras
CREATE TABLE public.work_rental_machinery (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  work_id UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  type TEXT NOT NULL,
  provider TEXT NOT NULL,
  machine_number TEXT NOT NULL,
  delivery_date DATE NOT NULL,
  removal_date DATE,
  daily_rate NUMERIC DEFAULT 0,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para mejorar rendimiento
CREATE INDEX idx_work_rental_machinery_work_id ON public.work_rental_machinery(work_id);
CREATE INDEX idx_work_rental_machinery_org ON public.work_rental_machinery(organization_id);
CREATE INDEX idx_work_rental_machinery_dates ON public.work_rental_machinery(delivery_date, removal_date);

-- Trigger para actualizar updated_at
CREATE TRIGGER update_work_rental_machinery_updated_at
BEFORE UPDATE ON public.work_rental_machinery
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Habilitar RLS
ALTER TABLE public.work_rental_machinery ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Users can view rental machinery in their org"
ON public.work_rental_machinery
FOR SELECT
USING (
  organization_id = current_user_organization()
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'master'::app_role)
    OR has_role(auth.uid(), 'site_manager'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.work_assignments wa
      WHERE wa.work_id = work_rental_machinery.work_id
      AND wa.user_id = auth.uid()
    )
  )
);

CREATE POLICY "Admins and managers can insert rental machinery"
ON public.work_rental_machinery
FOR INSERT
WITH CHECK (
  organization_id = current_user_organization()
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'master'::app_role)
    OR has_role(auth.uid(), 'site_manager'::app_role)
  )
);

CREATE POLICY "Admins and managers can update rental machinery"
ON public.work_rental_machinery
FOR UPDATE
USING (
  organization_id = current_user_organization()
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'master'::app_role)
    OR has_role(auth.uid(), 'site_manager'::app_role)
  )
)
WITH CHECK (
  organization_id = current_user_organization()
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'master'::app_role)
    OR has_role(auth.uid(), 'site_manager'::app_role)
  )
);

CREATE POLICY "Admins and managers can delete rental machinery"
ON public.work_rental_machinery
FOR DELETE
USING (
  organization_id = current_user_organization()
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'master'::app_role)
    OR has_role(auth.uid(), 'site_manager'::app_role)
  )
);