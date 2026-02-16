-- Eliminar la política insegura que permite a cualquiera crear notificaciones
DROP POLICY IF EXISTS "System can create notifications" ON public.notifications;

-- Crear una nueva política que bloquee inserts directos
-- Solo las funciones SECURITY DEFINER (triggers del sistema) podrán insertar
CREATE POLICY "Only system functions can create notifications"
ON public.notifications
FOR INSERT
WITH CHECK (false);

-- Las funciones SECURITY DEFINER existentes seguirán funcionando correctamente
-- ya que ejecutan con privilegios elevados y bypasean las políticas RLS