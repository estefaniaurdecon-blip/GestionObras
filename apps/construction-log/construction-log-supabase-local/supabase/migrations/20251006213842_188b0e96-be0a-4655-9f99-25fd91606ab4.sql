-- Añadir política DELETE para que usuarios puedan eliminar sus conversaciones
CREATE POLICY "Users can delete their messages"
ON public.messages
FOR DELETE
TO authenticated
USING (
  auth.uid() = from_user_id OR auth.uid() = to_user_id
);