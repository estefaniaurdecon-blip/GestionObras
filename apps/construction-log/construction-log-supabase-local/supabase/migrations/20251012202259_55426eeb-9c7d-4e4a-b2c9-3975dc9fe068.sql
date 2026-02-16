-- Crear tabla para rastrear qué work_reports ya fueron sincronizados
CREATE TABLE IF NOT EXISTS public.work_inventory_sync_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  work_id UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  work_report_id UUID NOT NULL REFERENCES public.work_reports(id) ON DELETE CASCADE,
  synced_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  organization_id UUID REFERENCES public.organizations(id),
  UNIQUE(work_id, work_report_id)
);

-- Habilitar RLS
ALTER TABLE public.work_inventory_sync_log ENABLE ROW LEVEL SECURITY;

-- Políticas RLS (solo admins y site managers pueden ver/gestionar)
CREATE POLICY "Admins and managers can view sync log"
  ON public.work_inventory_sync_log
  FOR SELECT
  USING (
    organization_id = current_user_organization() 
    AND (
      has_role(auth.uid(), 'admin'::app_role) 
      OR has_role(auth.uid(), 'site_manager'::app_role) 
      OR has_role(auth.uid(), 'master'::app_role)
    )
  );

CREATE POLICY "System can manage sync log"
  ON public.work_inventory_sync_log
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Índices para mejorar rendimiento
CREATE INDEX IF NOT EXISTS idx_sync_log_work_id ON public.work_inventory_sync_log(work_id);
CREATE INDEX IF NOT EXISTS idx_sync_log_work_report_id ON public.work_inventory_sync_log(work_report_id);