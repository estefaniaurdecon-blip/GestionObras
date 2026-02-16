-- Añadir políticas RLS para permitir eliminar archivos compartidos

-- Los usuarios pueden eliminar archivos que enviaron
CREATE POLICY "Users can delete sent files"
ON public.shared_files
FOR DELETE
USING (auth.uid() = from_user_id);

-- Los usuarios pueden eliminar archivos que recibieron
CREATE POLICY "Users can delete received files"
ON public.shared_files
FOR DELETE
USING (auth.uid() = to_user_id);