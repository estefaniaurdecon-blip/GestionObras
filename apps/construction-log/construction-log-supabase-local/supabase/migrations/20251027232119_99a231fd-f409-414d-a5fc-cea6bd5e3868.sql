-- Eliminar la política actual que requiere autenticación
DROP POLICY IF EXISTS "Authenticated users can view versions" ON app_versions;

-- Crear nueva política que permita lectura pública de versiones
CREATE POLICY "Anyone can view app versions"
ON app_versions
FOR SELECT
USING (true);

-- Comentario: Las versiones de la app no contienen información sensible
-- y deben ser accesibles públicamente para que los usuarios puedan
-- verificar actualizaciones sin necesidad de autenticación