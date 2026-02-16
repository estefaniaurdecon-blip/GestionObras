-- Eliminar la política existente de inserción de mensajes
DROP POLICY IF EXISTS "Users can send messages" ON public.messages;

-- Crear nueva política que verifica que el destinatario tenga un rol válido
CREATE POLICY "Users can send messages to valid recipients"
ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = from_user_id
  AND (
    -- El destinatario debe tener al menos uno de estos roles
    has_role(to_user_id, 'admin'::app_role) OR
    has_role(to_user_id, 'site_manager'::app_role) OR
    has_role(to_user_id, 'foreman'::app_role)
  )
  AND (
    -- El destinatario debe estar aprobado
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = to_user_id
      AND approved = true
    )
  )
);