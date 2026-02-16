-- Crear enum para roles de usuarios
CREATE TYPE public.app_role AS ENUM ('admin', 'foreman');

-- Crear tabla de perfiles de usuario
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  role app_role DEFAULT 'foreman',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS en profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Política: usuarios pueden ver su propio perfil
CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- Política: usuarios pueden actualizar su propio perfil
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id);

-- Crear tabla de roles de usuario (separada por seguridad)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, role)
);

-- Habilitar RLS en user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Función security definer para verificar roles (evita problemas de RLS recursivo)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Política: usuarios pueden ver sus propios roles
CREATE POLICY "Users can view own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Crear tabla de obras
CREATE TABLE public.works (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  number TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (number)
);

-- Habilitar RLS en works
ALTER TABLE public.works ENABLE ROW LEVEL SECURITY;

-- Política: todos los usuarios autenticados pueden ver obras
CREATE POLICY "Authenticated users can view works"
ON public.works
FOR SELECT
TO authenticated
USING (true);

-- Política: solo admins pueden crear obras
CREATE POLICY "Admins can insert works"
ON public.works
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Política: solo admins pueden actualizar obras
CREATE POLICY "Admins can update works"
ON public.works
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Crear tabla de partes de trabajo
CREATE TABLE public.work_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID REFERENCES public.works(id) ON DELETE CASCADE,
  work_name TEXT NOT NULL,
  work_number TEXT NOT NULL,
  date DATE NOT NULL,
  foreman TEXT,
  foreman_hours NUMERIC DEFAULT 0,
  site_manager TEXT,
  work_groups JSONB DEFAULT '[]'::jsonb,
  machinery_groups JSONB DEFAULT '[]'::jsonb,
  material_groups JSONB DEFAULT '[]'::jsonb,
  subcontract_groups JSONB DEFAULT '[]'::jsonb,
  observations TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS en work_reports
ALTER TABLE public.work_reports ENABLE ROW LEVEL SECURITY;

-- Política: todos los usuarios autenticados pueden ver partes
CREATE POLICY "Authenticated users can view reports"
ON public.work_reports
FOR SELECT
TO authenticated
USING (true);

-- Política: usuarios autenticados pueden crear partes
CREATE POLICY "Authenticated users can insert reports"
ON public.work_reports
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = created_by);

-- Política: usuarios pueden actualizar sus propios partes
CREATE POLICY "Users can update own reports"
ON public.work_reports
FOR UPDATE
TO authenticated
USING (auth.uid() = created_by);

-- Política: usuarios pueden eliminar sus propios partes
CREATE POLICY "Users can delete own reports"
ON public.work_reports
FOR DELETE
TO authenticated
USING (auth.uid() = created_by);

-- Política: admins pueden actualizar cualquier parte
CREATE POLICY "Admins can update all reports"
ON public.work_reports
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Política: admins pueden eliminar cualquier parte
CREATE POLICY "Admins can delete all reports"
ON public.work_reports
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Crear tabla de configuración de empresa
CREATE TABLE public.company_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  company_name TEXT,
  company_logo TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id)
);

-- Habilitar RLS en company_settings
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

-- Política: usuarios pueden ver su propia configuración
CREATE POLICY "Users can view own settings"
ON public.company_settings
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Política: usuarios pueden insertar su propia configuración
CREATE POLICY "Users can insert own settings"
ON public.company_settings
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Política: usuarios pueden actualizar su propia configuración
CREATE POLICY "Users can update own settings"
ON public.company_settings
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

-- Función para crear perfil automáticamente al registrarse
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Crear perfil
  INSERT INTO public.profiles (id, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );
  
  -- Asignar rol de encargado por defecto
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'foreman');
  
  -- Crear configuración de empresa vacía
  INSERT INTO public.company_settings (user_id)
  VALUES (NEW.id);
  
  RETURN NEW;
END;
$$;

-- Trigger para ejecutar la función al crear usuario
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Triggers para updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_works_updated_at
  BEFORE UPDATE ON public.works
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_work_reports_updated_at
  BEFORE UPDATE ON public.work_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_company_settings_updated_at
  BEFORE UPDATE ON public.company_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Índices para mejorar rendimiento
CREATE INDEX idx_work_reports_created_by ON public.work_reports(created_by);
CREATE INDEX idx_work_reports_date ON public.work_reports(date);
CREATE INDEX idx_work_reports_work_name ON public.work_reports(work_name);
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);