-- Eliminar todas las políticas de INSERT en la tabla messages
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'messages' AND cmd = 'INSERT') LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON public.messages';
    END LOOP;
END $$;

-- Crear nueva política que verifica tanto remitente como destinatario
CREATE POLICY "Approved users can send messages to valid recipients"
ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (
  -- El usuario autenticado debe ser el remitente
  auth.uid() = from_user_id
  AND
  -- El remitente debe estar aprobado y tener un rol válido
  (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.user_roles ur ON ur.user_id = p.id
      WHERE p.id = auth.uid()
      AND p.approved = true
      AND ur.role IN ('admin', 'site_manager', 'foreman')
    )
  )
  AND
  -- El destinatario debe estar aprobado y tener un rol válido
  (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.user_roles ur ON ur.user_id = p.id
      WHERE p.id = to_user_id
      AND p.approved = true
      AND ur.role IN ('admin', 'site_manager', 'foreman')
    )
  )
);