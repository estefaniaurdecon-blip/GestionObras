-- Eliminar políticas existentes que puedan estar bloqueando el acceso
DROP POLICY IF EXISTS "Users can view their organization profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;

-- Crear política simple para que los usuarios puedan ver su propio perfil
CREATE POLICY "Users can view their own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- Permitir que los usuarios actualicen su propio perfil
CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id);

-- Permitir que los usuarios de la misma organización se vean entre sí
CREATE POLICY "Users can view organization profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  auth.uid() = id 
  OR 
  (organization_id IS NOT NULL AND organization_id = current_user_organization())
);

-- Permitir que los admins vean todos los perfiles de su organización
CREATE POLICY "Admins can manage organization profiles"
ON public.profiles
FOR ALL
TO authenticated
USING (
  auth.uid() = id 
  OR 
  (has_role(auth.uid(), 'admin') AND organization_id = current_user_organization())
);