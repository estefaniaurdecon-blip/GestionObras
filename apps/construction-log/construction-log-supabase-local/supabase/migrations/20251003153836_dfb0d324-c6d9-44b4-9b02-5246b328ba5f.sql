-- Actualizar la restricción de verificación de tipos de notificación
ALTER TABLE public.notifications 
DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications 
ADD CONSTRAINT notifications_type_check 
CHECK (type IN ('work_report_created', 'work_report_approved', 'work_report_rejected', 'new_message', 'new_comment', 'new_user_pending'));