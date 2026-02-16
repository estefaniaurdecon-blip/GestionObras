-- Actualizar política para que sea segura pero funcional
DROP POLICY IF EXISTS "Users can send messages simple" ON public.messages;

CREATE POLICY "Approved users can send messages to approved users"
ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = from_user_id
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND approved = true
  )
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = to_user_id AND approved = true
  )
);