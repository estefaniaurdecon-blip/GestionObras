-- Crear tabla para la cartera de empresas
CREATE TABLE public.company_portfolio (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  company_type TEXT NOT NULL, -- proveedor, subcontratista, cliente, etc.
  contact_person TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  address TEXT,
  city TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'España',
  fiscal_id TEXT, -- CIF/NIF
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.company_portfolio ENABLE ROW LEVEL SECURITY;

-- Política: usuarios pueden ver empresas de su organización
CREATE POLICY "Users can view companies in their org"
  ON public.company_portfolio
  FOR SELECT
  USING (organization_id = current_user_organization());

-- Política: usuarios pueden añadir empresas a su organización
CREATE POLICY "Users can add companies to their org"
  ON public.company_portfolio
  FOR INSERT
  WITH CHECK (
    organization_id = current_user_organization()
    AND created_by = auth.uid()
  );

-- Política: usuarios pueden actualizar empresas de su organización
CREATE POLICY "Users can update companies in their org"
  ON public.company_portfolio
  FOR UPDATE
  USING (organization_id = current_user_organization());

-- Política: admins y site managers pueden eliminar empresas
CREATE POLICY "Admins can delete companies"
  ON public.company_portfolio
  FOR DELETE
  USING (
    organization_id = current_user_organization()
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'site_manager'::app_role)
      OR has_role(auth.uid(), 'master'::app_role)
    )
  );

-- Trigger para actualizar updated_at
CREATE TRIGGER update_company_portfolio_updated_at
  BEFORE UPDATE ON public.company_portfolio
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();