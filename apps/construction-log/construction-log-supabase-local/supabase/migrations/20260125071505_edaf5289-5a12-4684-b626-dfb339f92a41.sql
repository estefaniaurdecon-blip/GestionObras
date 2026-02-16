-- Crear tabla para gestionar repasos de obras (punch list / snag list)
CREATE TABLE public.work_repasos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  work_id UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  description TEXT NOT NULL,
  assigned_company TEXT,
  estimated_hours NUMERIC DEFAULT 0,
  actual_hours NUMERIC DEFAULT 0,
  before_image TEXT,
  after_image TEXT,
  created_by UUID REFERENCES auth.users(id),
  completed_at TIMESTAMP WITH TIME ZONE,
  completed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para mejorar rendimiento
CREATE INDEX idx_work_repasos_work_id ON public.work_repasos(work_id);
CREATE INDEX idx_work_repasos_organization_id ON public.work_repasos(organization_id);
CREATE INDEX idx_work_repasos_status ON public.work_repasos(status);

-- Trigger para actualizar updated_at
CREATE TRIGGER update_work_repasos_updated_at
  BEFORE UPDATE ON public.work_repasos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Habilitar RLS
ALTER TABLE public.work_repasos ENABLE ROW LEVEL SECURITY;

-- Políticas RLS: Solo usuarios de la misma organización pueden ver repasos
CREATE POLICY "Users can view repasos in their org"
  ON public.work_repasos
  FOR SELECT
  USING (
    organization_id = current_user_organization()
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'master'::app_role)
      OR has_role(auth.uid(), 'site_manager'::app_role)
      OR EXISTS (
        SELECT 1 FROM work_assignments wa
        WHERE wa.work_id = work_repasos.work_id
        AND wa.user_id = auth.uid()
      )
    )
  );

-- Políticas RLS: Admins y managers pueden crear repasos
CREATE POLICY "Admins and managers can insert repasos"
  ON public.work_repasos
  FOR INSERT
  WITH CHECK (
    organization_id = current_user_organization()
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'master'::app_role)
      OR has_role(auth.uid(), 'site_manager'::app_role)
    )
  );

-- Políticas RLS: Admins y managers pueden actualizar repasos
CREATE POLICY "Admins and managers can update repasos"
  ON public.work_repasos
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

-- Políticas RLS: Admins y managers pueden eliminar repasos
CREATE POLICY "Admins and managers can delete repasos"
  ON public.work_repasos
  FOR DELETE
  USING (
    organization_id = current_user_organization()
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'master'::app_role)
      OR has_role(auth.uid(), 'site_manager'::app_role)
    )
  );