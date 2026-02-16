-- Eliminar la constraint existente
ALTER TABLE public.notifications 
DROP CONSTRAINT IF EXISTS notifications_type_check;

-- Agregar la nueva constraint con los tipos adicionales
ALTER TABLE public.notifications 
ADD CONSTRAINT notifications_type_check 
CHECK (type = ANY (ARRAY[
  'work_report_created'::text,
  'work_report_approved'::text,
  'work_report_rejected'::text,
  'work_report_completed'::text,
  'work_report_overdue'::text,
  'new_message'::text,
  'new_comment'::text,
  'new_user_pending'::text,
  'file_downloaded'::text,
  'work_assigned'::text,
  'update'::text
]));