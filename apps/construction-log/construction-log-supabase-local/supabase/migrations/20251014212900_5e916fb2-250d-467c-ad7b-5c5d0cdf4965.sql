-- Fix notifications type constraint to allow 'file_downloaded'
-- This resolves errors when updating shared_files triggers insert a 'file_downloaded' notification

-- 1) Drop existing CHECK constraint if present
ALTER TABLE public.notifications
DROP CONSTRAINT IF EXISTS notifications_type_check;

-- 2) Recreate CHECK constraint with the expanded allowed list
ALTER TABLE public.notifications
ADD CONSTRAINT notifications_type_check
CHECK (
  type IN (
    'work_report_approved',
    'work_report_rejected',
    'new_message',
    'new_comment',
    'new_user_pending',
    'file_downloaded'
  )
);

-- Note: Column is TEXT; we are not touching RLS. The insert is done by a DB trigger and must pass this check.
