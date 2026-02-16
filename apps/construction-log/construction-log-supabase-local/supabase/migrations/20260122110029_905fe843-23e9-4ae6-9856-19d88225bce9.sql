-- Crear tabla para rastrear descargas de partes de trabajo
CREATE TABLE IF NOT EXISTS public.work_report_downloads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  work_report_id UUID NOT NULL REFERENCES public.work_reports(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  downloaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  format TEXT NOT NULL CHECK (format IN ('pdf', 'excel')),
  UNIQUE(work_report_id, user_id)
);

-- Enable RLS
ALTER TABLE public.work_report_downloads ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Users can insert their own downloads"
ON public.work_report_downloads FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own downloads"
ON public.work_report_downloads FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own downloads"
ON public.work_report_downloads FOR UPDATE
USING (auth.uid() = user_id);

-- Actualizar el check constraint de notifications para incluir nuevos tipos
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check 
CHECK (type IN (
  'work_report_created', 
  'work_report_approved', 
  'work_report_rejected', 
  'new_message', 
  'new_comment',
  'work_report_pending',
  'work_assigned',
  'work_expiry_warning',
  'machinery_expiry_warning',
  'work_report_completed',
  'work_report_modified',
  'file_downloaded',
  'work_report_overdue',
  'new_user_pending'
));

-- Añadir columna para almacenar las secciones modificadas
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Índices para mejor rendimiento
CREATE INDEX IF NOT EXISTS idx_work_report_downloads_work_report ON public.work_report_downloads(work_report_id);
CREATE INDEX IF NOT EXISTS idx_work_report_downloads_user ON public.work_report_downloads(user_id);

-- Habilitar realtime para la tabla de descargas
ALTER PUBLICATION supabase_realtime ADD TABLE public.work_report_downloads;