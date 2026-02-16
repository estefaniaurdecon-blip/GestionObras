-- Crear una política temporal más simple para debug
DROP POLICY IF EXISTS "Approved users can send messages" ON public.messages;

CREATE POLICY "Users can send messages simple"
ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = from_user_id);