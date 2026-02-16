-- Enable RLS on messages table (if not already enabled)
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can send messages" ON public.messages;
DROP POLICY IF EXISTS "Users can view their messages" ON public.messages;
DROP POLICY IF EXISTS "Users can update received messages" ON public.messages;
DROP POLICY IF EXISTS "Users can delete their messages" ON public.messages;

-- Policy: Users can send messages (INSERT)
CREATE POLICY "Users can send messages"
ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = from_user_id 
  AND (
    organization_id IS NULL 
    OR organization_id = current_user_organization()
  )
  AND same_organization(to_user_id)
);

-- Policy: Users can view messages where they are sender or recipient (SELECT)
CREATE POLICY "Users can view their messages"
ON public.messages
FOR SELECT
TO authenticated
USING (
  auth.uid() = from_user_id 
  OR auth.uid() = to_user_id
);

-- Policy: Users can update messages they received (UPDATE - for marking as read)
CREATE POLICY "Users can update received messages"
ON public.messages
FOR UPDATE
TO authenticated
USING (auth.uid() = to_user_id)
WITH CHECK (auth.uid() = to_user_id);

-- Policy: Users can delete messages they sent or received (DELETE)
CREATE POLICY "Users can delete their messages"
ON public.messages
FOR DELETE
TO authenticated
USING (
  auth.uid() = from_user_id 
  OR auth.uid() = to_user_id
);