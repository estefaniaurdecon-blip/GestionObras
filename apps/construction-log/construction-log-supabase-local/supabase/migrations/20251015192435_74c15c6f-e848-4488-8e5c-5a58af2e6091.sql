-- Crear tabla para tipos de empresa personalizados por organización
CREATE TABLE public.company_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  type_name TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(organization_id, type_name)
);

-- Habilitar RLS
ALTER TABLE public.company_types ENABLE ROW LEVEL SECURITY;

-- Política: Los usuarios pueden ver los tipos de su organización
CREATE POLICY "Users can view types in their org"
  ON public.company_types
  FOR SELECT
  USING (organization_id = current_user_organization());

-- Política: Los usuarios pueden crear tipos en su organización
CREATE POLICY "Users can create types in their org"
  ON public.company_types
  FOR INSERT
  WITH CHECK (
    organization_id = current_user_organization() 
    AND created_by = auth.uid()
  );

-- Política: Los usuarios pueden actualizar tipos de su organización
CREATE POLICY "Users can update types in their org"
  ON public.company_types
  FOR UPDATE
  USING (organization_id = current_user_organization());

-- Política: Solo admins/site_managers/masters pueden eliminar tipos
CREATE POLICY "Admins can delete types in their org"
  ON public.company_types
  FOR DELETE
  USING (
    organization_id = current_user_organization()
    AND (
      has_role(auth.uid(), 'admin'::app_role) 
      OR has_role(auth.uid(), 'site_manager'::app_role)
      OR has_role(auth.uid(), 'master'::app_role)
    )
  );

-- Índice para mejorar rendimiento
CREATE INDEX idx_company_types_org ON public.company_types(organization_id);