-- Crear tabla para inventario de materiales y herramientas de obra
CREATE TABLE IF NOT EXISTS public.work_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID REFERENCES public.works(id) ON DELETE CASCADE NOT NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('material', 'herramienta')),
  category TEXT, -- Categoría específica (ej: 'cemento', 'taladro', etc.)
  name TEXT NOT NULL,
  quantity NUMERIC DEFAULT 0,
  unit TEXT DEFAULT 'ud',
  last_entry_date DATE,
  last_supplier TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(work_id, item_type, name)
);

-- Índices para mejor rendimiento
CREATE INDEX IF NOT EXISTS idx_work_inventory_work_id ON public.work_inventory(work_id);
CREATE INDEX IF NOT EXISTS idx_work_inventory_item_type ON public.work_inventory(item_type);
CREATE INDEX IF NOT EXISTS idx_work_inventory_organization ON public.work_inventory(organization_id);

-- Trigger para actualizar updated_at
CREATE TRIGGER update_work_inventory_updated_at
  BEFORE UPDATE ON public.work_inventory
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Habilitar RLS
ALTER TABLE public.work_inventory ENABLE ROW LEVEL SECURITY;

-- Políticas RLS: usuarios de la organización pueden ver el inventario de sus obras
CREATE POLICY "Users can view inventory of their works"
  ON public.work_inventory
  FOR SELECT
  USING (
    organization_id = current_user_organization()
    OR EXISTS (
      SELECT 1 FROM public.work_assignments wa
      WHERE wa.work_id = work_inventory.work_id
        AND wa.user_id = auth.uid()
    )
  );

-- Políticas RLS: admins y site managers pueden modificar inventario
CREATE POLICY "Admins and managers can manage inventory"
  ON public.work_inventory
  FOR ALL
  USING (
    organization_id = current_user_organization()
    AND (
      has_role(auth.uid(), 'admin')
      OR has_role(auth.uid(), 'site_manager')
      OR has_role(auth.uid(), 'master')
    )
  )
  WITH CHECK (
    organization_id = current_user_organization()
    AND (
      has_role(auth.uid(), 'admin')
      OR has_role(auth.uid(), 'site_manager')
      OR has_role(auth.uid(), 'master')
    )
  );