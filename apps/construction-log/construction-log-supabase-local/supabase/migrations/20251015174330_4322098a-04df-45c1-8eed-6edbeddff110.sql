-- Agregar campos para mejor identificación de organizaciones y usuarios
-- Esto permite que múltiples organizaciones tengan el mismo nombre comercial
-- pero sean únicas por su identificación fiscal

-- Añadir campos de identificación única para organizaciones
ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS fiscal_id TEXT UNIQUE,  -- NIF/CIF/VAT único
ADD COLUMN IF NOT EXISTS legal_name TEXT,  -- Razón social oficial
ADD COLUMN IF NOT EXISTS commercial_name TEXT,  -- Nombre comercial (puede repetirse)
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS postal_code TEXT,
ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'España',
ADD COLUMN IF NOT EXISTS max_users INTEGER DEFAULT 5,  -- Límite de usuarios según suscripción
ADD COLUMN IF NOT EXISTS current_users INTEGER DEFAULT 0;  -- Contador de usuarios activos

-- Actualizar la columna 'name' existente para que sea el nombre comercial
COMMENT ON COLUMN public.organizations.name IS 'Nombre comercial - puede repetirse entre organizaciones';
COMMENT ON COLUMN public.organizations.fiscal_id IS 'Identificación fiscal única (NIF/CIF/VAT) - no puede repetirse';
COMMENT ON COLUMN public.organizations.legal_name IS 'Razón social oficial de la empresa';

-- Agregar más información a los perfiles de usuario
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS email TEXT,  -- Email duplicado para fácil acceso
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS position TEXT,  -- Cargo en la empresa
ADD COLUMN IF NOT EXISTS department TEXT,
ADD COLUMN IF NOT EXISTS last_login TIMESTAMP WITH TIME ZONE;

-- Crear índices para mejorar búsquedas
CREATE INDEX IF NOT EXISTS idx_organizations_fiscal_id ON public.organizations(fiscal_id);
CREATE INDEX IF NOT EXISTS idx_organizations_commercial_name ON public.organizations(commercial_name);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_full_name ON public.profiles(full_name);

-- Función para actualizar el contador de usuarios activos
CREATE OR REPLACE FUNCTION public.update_organization_user_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.organizations
    SET current_users = current_users + 1
    WHERE id = NEW.organization_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.organizations
    SET current_users = GREATEST(0, current_users - 1)
    WHERE id = OLD.organization_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Trigger para mantener actualizado el contador de usuarios
DROP TRIGGER IF EXISTS update_org_user_count ON public.profiles;
CREATE TRIGGER update_org_user_count
AFTER INSERT OR DELETE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_organization_user_count();

-- Inicializar el contador de usuarios para organizaciones existentes
UPDATE public.organizations o
SET current_users = (
  SELECT COUNT(*)
  FROM public.profiles p
  WHERE p.organization_id = o.id
);