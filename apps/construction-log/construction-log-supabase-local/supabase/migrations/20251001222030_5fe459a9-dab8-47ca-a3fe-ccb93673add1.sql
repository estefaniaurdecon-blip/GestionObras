-- Agregar política para que los usuarios puedan eliminar sus propias notificaciones
CREATE POLICY "Users can delete their own notifications"
ON public.notifications
FOR DELETE
USING (auth.uid() = user_id);