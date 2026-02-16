-- =====================================================
-- MÓDULO: GESTIÓN DE RESIDUOS Y MEDIO AMBIENTE
-- =====================================================

-- 1. CREAR ENUMS
-- =====================================================

-- Categoría de gestor/transportista
CREATE TYPE public.waste_manager_category AS ENUM (
  'transporter',      -- Transportista autorizado
  'landfill',         -- Vertedero / Planta de tratamiento
  'container_rental', -- Alquiler de contenedores
  'recycler'          -- Planta de reciclaje
);

-- Modo de operación
CREATE TYPE public.waste_operation_mode AS ENUM (
  'container_management', -- Gestión de contenedores (cubas)
  'direct_transport'      -- Transporte directo (camiones)
);

-- Tipo de acción
CREATE TYPE public.waste_action_type AS ENUM (
  'delivery',    -- Entrega/Puesta de contenedor
  'withdrawal',  -- Retirada de contenedor
  'exchange',    -- Cambio (retirada + entrega)
  'load'         -- Carga directa en camión
);

-- Tamaño de contenedor
CREATE TYPE public.container_size AS ENUM (
  '3m3',
  '6m3',
  '12m3',
  '30m3'
);

-- 2. TABLA MAESTRA: waste_types (Tipos de Residuos)
-- =====================================================
CREATE TABLE public.waste_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  ler_code TEXT, -- Código Lista Europea de Residuos (6 dígitos)
  is_hazardous BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT false, -- true = predefinido del sistema
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Índice único por organización (o global si organization_id es null)
  CONSTRAINT unique_waste_type_per_org UNIQUE NULLS NOT DISTINCT (organization_id, name)
);

-- Índices
CREATE INDEX idx_waste_types_org ON public.waste_types(organization_id);
CREATE INDEX idx_waste_types_hazardous ON public.waste_types(is_hazardous) WHERE is_hazardous = true;

-- RLS
ALTER TABLE public.waste_types ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Users can view system waste types"
  ON public.waste_types FOR SELECT
  USING (is_system = true OR organization_id = current_user_organization());

CREATE POLICY "Admins can insert waste types"
  ON public.waste_types FOR INSERT
  WITH CHECK (
    organization_id = current_user_organization() 
    AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'master') OR has_role(auth.uid(), 'site_manager'))
  );

CREATE POLICY "Admins can update waste types"
  ON public.waste_types FOR UPDATE
  USING (
    organization_id = current_user_organization() 
    AND is_system = false
    AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'master') OR has_role(auth.uid(), 'site_manager'))
  );

CREATE POLICY "Admins can delete waste types"
  ON public.waste_types FOR DELETE
  USING (
    organization_id = current_user_organization() 
    AND is_system = false
    AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'master'))
  );

-- 3. TABLA MAESTRA: waste_managers (Gestores y Transportistas)
-- =====================================================
CREATE TABLE public.waste_managers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  fiscal_id TEXT, -- CIF/NIF
  nima_number TEXT, -- Número de Identificación Medioambiental de Andalucía
  authorization_number TEXT, -- Número de autorización de gestor
  category waste_manager_category NOT NULL,
  contact_person TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  address TEXT,
  city TEXT,
  postal_code TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  CONSTRAINT unique_manager_per_org UNIQUE (organization_id, company_name)
);

-- Índices
CREATE INDEX idx_waste_managers_org ON public.waste_managers(organization_id);
CREATE INDEX idx_waste_managers_category ON public.waste_managers(category);
CREATE INDEX idx_waste_managers_active ON public.waste_managers(is_active) WHERE is_active = true;
CREATE INDEX idx_waste_managers_nima ON public.waste_managers(nima_number) WHERE nima_number IS NOT NULL;

-- RLS
ALTER TABLE public.waste_managers ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Users can view waste managers in their org"
  ON public.waste_managers FOR SELECT
  USING (organization_id = current_user_organization());

CREATE POLICY "Admins can insert waste managers"
  ON public.waste_managers FOR INSERT
  WITH CHECK (
    organization_id = current_user_organization()
    AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'master') OR has_role(auth.uid(), 'site_manager'))
  );

CREATE POLICY "Admins can update waste managers"
  ON public.waste_managers FOR UPDATE
  USING (
    organization_id = current_user_organization()
    AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'master') OR has_role(auth.uid(), 'site_manager'))
  );

CREATE POLICY "Admins can delete waste managers"
  ON public.waste_managers FOR DELETE
  USING (
    organization_id = current_user_organization()
    AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'master'))
  );

-- 4. TABLA TRANSACCIONAL: work_report_waste_entries
-- =====================================================
CREATE TABLE public.work_report_waste_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_report_id UUID NOT NULL REFERENCES public.work_reports(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  work_id UUID REFERENCES public.works(id) ON DELETE SET NULL,
  
  -- Clasificación de la operación
  operation_mode waste_operation_mode NOT NULL,
  action_type waste_action_type NOT NULL,
  
  -- Relaciones con tablas maestras
  waste_type_id UUID REFERENCES public.waste_types(id) ON DELETE SET NULL,
  manager_id UUID REFERENCES public.waste_managers(id) ON DELETE SET NULL,
  
  -- Datos de identificación (uno u otro según operation_mode)
  container_id TEXT, -- ID visual de la cuba (ej. "C-405")
  container_size container_size, -- Tamaño del contenedor
  vehicle_plate TEXT, -- Matrícula del camión
  vehicle_type TEXT, -- Tipo de vehículo (bañera, centauro, etc.)
  operator_name TEXT, -- Nombre del operador/conductor
  
  -- Volumetría
  volume_m3 NUMERIC(10,2), -- Volumen en metros cúbicos
  weight_tn NUMERIC(10,2), -- Peso en toneladas (opcional)
  
  -- Trazabilidad
  destination_plant TEXT, -- Planta de destino
  ticket_number TEXT, -- Número de albarán/ticket
  ticket_photo_url TEXT, -- URL de la foto del albarán en Storage
  
  -- Para operaciones de cambio (exchange)
  linked_entry_id UUID REFERENCES public.work_report_waste_entries(id), -- Vincula retirada con entrega
  new_container_id TEXT, -- Nuevo ID de contenedor (en caso de cambio)
  
  -- Metadatos
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Validaciones
  CONSTRAINT valid_container_data CHECK (
    (operation_mode = 'container_management' AND container_id IS NOT NULL)
    OR operation_mode = 'direct_transport'
  ),
  CONSTRAINT valid_transport_data CHECK (
    (operation_mode = 'direct_transport' AND vehicle_plate IS NOT NULL)
    OR operation_mode = 'container_management'
  )
);

-- Índices
CREATE INDEX idx_waste_entries_work_report ON public.work_report_waste_entries(work_report_id);
CREATE INDEX idx_waste_entries_org ON public.work_report_waste_entries(organization_id);
CREATE INDEX idx_waste_entries_work ON public.work_report_waste_entries(work_id) WHERE work_id IS NOT NULL;
CREATE INDEX idx_waste_entries_waste_type ON public.work_report_waste_entries(waste_type_id);
CREATE INDEX idx_waste_entries_manager ON public.work_report_waste_entries(manager_id);
CREATE INDEX idx_waste_entries_container ON public.work_report_waste_entries(container_id) WHERE container_id IS NOT NULL;
CREATE INDEX idx_waste_entries_vehicle ON public.work_report_waste_entries(vehicle_plate) WHERE vehicle_plate IS NOT NULL;
CREATE INDEX idx_waste_entries_created ON public.work_report_waste_entries(created_at DESC);

-- RLS
ALTER TABLE public.work_report_waste_entries ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Users can view waste entries in their org"
  ON public.work_report_waste_entries FOR SELECT
  USING (
    organization_id = current_user_organization()
    AND (
      has_role(auth.uid(), 'admin') 
      OR has_role(auth.uid(), 'master')
      OR has_role(auth.uid(), 'site_manager')
      OR (work_id IS NOT NULL AND is_assigned_to_work(auth.uid(), work_id))
      OR created_by = auth.uid()
    )
  );

CREATE POLICY "Users can insert waste entries"
  ON public.work_report_waste_entries FOR INSERT
  WITH CHECK (
    organization_id = current_user_organization()
    AND (
      has_role(auth.uid(), 'admin')
      OR has_role(auth.uid(), 'master')
      OR has_role(auth.uid(), 'site_manager')
      OR has_role(auth.uid(), 'foreman')
      OR (work_id IS NOT NULL AND is_assigned_to_work(auth.uid(), work_id))
    )
  );

CREATE POLICY "Users can update waste entries"
  ON public.work_report_waste_entries FOR UPDATE
  USING (
    organization_id = current_user_organization()
    AND (
      has_role(auth.uid(), 'admin')
      OR has_role(auth.uid(), 'master')
      OR has_role(auth.uid(), 'site_manager')
      OR created_by = auth.uid()
    )
  );

CREATE POLICY "Admins can delete waste entries"
  ON public.work_report_waste_entries FOR DELETE
  USING (
    organization_id = current_user_organization()
    AND (
      has_role(auth.uid(), 'admin')
      OR has_role(auth.uid(), 'master')
      OR has_role(auth.uid(), 'site_manager')
    )
  );

-- 5. TRIGGERS PARA updated_at
-- =====================================================
CREATE TRIGGER update_waste_types_updated_at
  BEFORE UPDATE ON public.waste_types
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_waste_managers_updated_at
  BEFORE UPDATE ON public.waste_managers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_waste_entries_updated_at
  BEFORE UPDATE ON public.work_report_waste_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 6. DATOS INICIALES: Tipos de residuos del sistema
-- =====================================================
INSERT INTO public.waste_types (name, ler_code, is_hazardous, is_system, description) VALUES
  ('Mezcla RCD', '170904', false, true, 'Residuos mezclados de construcción y demolición'),
  ('Hormigón', '170101', false, true, 'Hormigón sin armaduras ni contaminantes'),
  ('Ladrillos', '170102', false, true, 'Ladrillos y bloques cerámicos'),
  ('Tejas y materiales cerámicos', '170103', false, true, 'Tejas, azulejos y otros materiales cerámicos'),
  ('Madera', '170201', false, true, 'Madera sin tratamiento químico'),
  ('Madera tratada', '170204*', true, true, 'Madera tratada con conservantes peligrosos'),
  ('Vidrio', '170202', false, true, 'Vidrio de ventanas y otros'),
  ('Plástico', '170203', false, true, 'Plásticos de construcción'),
  ('Metales ferrosos', '170405', false, true, 'Hierro y acero'),
  ('Metales no ferrosos', '170404', false, true, 'Aluminio, cobre, latón, etc.'),
  ('Cables', '170411', false, true, 'Cables sin sustancias peligrosas'),
  ('Tierras y piedras', '170504', false, true, 'Tierras y piedras limpias'),
  ('Tierras contaminadas', '170503*', true, true, 'Tierras con sustancias peligrosas'),
  ('Amianto', '170605*', true, true, 'Materiales de construcción con amianto'),
  ('Yeso', '170802', false, true, 'Materiales de construcción a base de yeso'),
  ('Residuos de pintura', '080111*', true, true, 'Restos de pintura y disolventes'),
  ('Aceites usados', '130205*', true, true, 'Aceites minerales usados de maquinaria'),
  ('Cartón y papel', '200101', false, true, 'Embalajes de cartón y papel');

-- 7. VISTA PARA CONTENEDORES ACTIVOS EN OBRA
-- =====================================================
CREATE OR REPLACE VIEW public.active_containers AS
SELECT 
  e.container_id,
  e.container_size,
  e.waste_type_id,
  wt.name as waste_type_name,
  e.manager_id,
  wm.company_name as manager_name,
  e.work_id,
  w.name as work_name,
  e.created_at as delivery_date,
  e.organization_id
FROM public.work_report_waste_entries e
LEFT JOIN public.waste_types wt ON e.waste_type_id = wt.id
LEFT JOIN public.waste_managers wm ON e.manager_id = wm.id
LEFT JOIN public.works w ON e.work_id = w.id
WHERE e.operation_mode = 'container_management'
  AND e.action_type = 'delivery'
  AND e.container_id IS NOT NULL
  AND NOT EXISTS (
    -- No hay retirada posterior para este contenedor en esta obra
    SELECT 1 FROM public.work_report_waste_entries withdrawal
    WHERE withdrawal.container_id = e.container_id
      AND withdrawal.work_id = e.work_id
      AND withdrawal.action_type IN ('withdrawal', 'exchange')
      AND withdrawal.created_at > e.created_at
  );

-- Comentarios para documentación
COMMENT ON TABLE public.waste_types IS 'Tipos de residuos estandarizados con códigos LER';
COMMENT ON TABLE public.waste_managers IS 'Gestores, transportistas y plantas de tratamiento autorizadas';
COMMENT ON TABLE public.work_report_waste_entries IS 'Registro de movimientos de residuos por parte de trabajo';
COMMENT ON VIEW public.active_containers IS 'Contenedores actualmente presentes en cada obra';