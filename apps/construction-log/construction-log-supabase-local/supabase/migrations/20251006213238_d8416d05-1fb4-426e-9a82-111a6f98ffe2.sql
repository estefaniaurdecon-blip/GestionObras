-- Update policy: allow any approved users to message each other
DROP POLICY IF EXISTS "Approved users can send messages to valid recipients" ON public.messages;

CREATE POLICY "Approved users can send messages"
ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = from_user_id
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
    AND p.approved = true
  )
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = to_user_id
    AND p.approved = true
  )
);
