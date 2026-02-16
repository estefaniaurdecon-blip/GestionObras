-- ============================================
-- SISTEMA DE AUDIT LOGS PARA CUMPLIMIENTO
-- ISO 27001, GDPR (Art. 30), SOC 2
-- ============================================

-- Tabla para registrar todas las acciones de seguridad críticas
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id UUID,
  details JSONB,
  ip_address TEXT,
  user_agent TEXT,
  success BOOLEAN DEFAULT true,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON public.audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_org ON public.audit_logs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON public.audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

-- Habilitar RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Política: Solo admins y masters pueden ver logs de su organización
CREATE POLICY "Admins can view audit logs"
ON public.audit_logs
FOR SELECT
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'master'::app_role))
  AND organization_id = current_user_organization()
);

-- Política: El sistema puede insertar logs
CREATE POLICY "System can insert audit logs"
ON public.audit_logs
FOR INSERT
WITH CHECK (true);

-- Función helper para crear logs
CREATE OR REPLACE FUNCTION public.create_audit_log(
  p_action TEXT,
  p_resource_type TEXT,
  p_resource_id UUID,
  p_details JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id UUID;
  v_org_id UUID;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM public.profiles
  WHERE id = auth.uid();

  INSERT INTO public.audit_logs (
    user_id,
    organization_id,
    action,
    resource_type,
    resource_id,
    details
  ) VALUES (
    auth.uid(),
    v_org_id,
    p_action,
    p_resource_type,
    p_resource_id,
    p_details
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

-- Trigger: Loggear eliminación de usuarios
CREATE OR REPLACE FUNCTION public.audit_log_user_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.create_audit_log(
    'delete',
    'user',
    OLD.id,
    jsonb_build_object(
      'deleted_user_name', OLD.full_name,
      'deleted_user_email', OLD.email
    )
  );
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS audit_user_delete ON public.profiles;
CREATE TRIGGER audit_user_delete
BEFORE DELETE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.audit_log_user_delete();

-- Trigger: Loggear aprobación de partes
CREATE OR REPLACE FUNCTION public.audit_log_work_report_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.approved IS DISTINCT FROM NEW.approved THEN
    PERFORM public.create_audit_log(
      CASE WHEN NEW.approved THEN 'approve' ELSE 'reject' END,
      'work_report',
      NEW.id,
      jsonb_build_object(
        'work_name', NEW.work_name,
        'work_number', NEW.work_number,
        'date', NEW.date,
        'approved_by', NEW.approved_by
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_work_report_approval ON public.work_reports;
CREATE TRIGGER audit_work_report_approval
AFTER UPDATE ON public.work_reports
FOR EACH ROW
WHEN (OLD.approved IS DISTINCT FROM NEW.approved)
EXECUTE FUNCTION public.audit_log_work_report_approval();

-- Trigger: Loggear cambios en roles
CREATE OR REPLACE FUNCTION public.audit_log_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_name TEXT;
BEGIN
  SELECT full_name INTO v_user_name
  FROM public.profiles
  WHERE id = COALESCE(NEW.user_id, OLD.user_id);

  IF TG_OP = 'INSERT' THEN
    PERFORM public.create_audit_log(
      'role_assign',
      'user_role',
      NEW.id,
      jsonb_build_object(
        'user_id', NEW.user_id,
        'user_name', v_user_name,
        'role', NEW.role
      )
    );
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.create_audit_log(
      'role_revoke',
      'user_role',
      OLD.id,
      jsonb_build_object(
        'user_id', OLD.user_id,
        'user_name', v_user_name,
        'role', OLD.role
      )
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS audit_role_change ON public.user_roles;
CREATE TRIGGER audit_role_change
AFTER INSERT OR DELETE ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.audit_log_role_change();

COMMENT ON TABLE public.audit_logs IS 'Registro de auditoría ISO 27001, GDPR Art.30, SOC 2';