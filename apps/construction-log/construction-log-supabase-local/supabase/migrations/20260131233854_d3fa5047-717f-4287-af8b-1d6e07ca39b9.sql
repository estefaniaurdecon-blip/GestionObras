
-- Drop the existing constraint and add the new one with anomaly_detected type
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check 
CHECK (type = ANY (ARRAY[
  'work_report_created'::text, 
  'work_report_approved'::text, 
  'work_report_rejected'::text, 
  'new_message'::text, 
  'new_comment'::text, 
  'work_report_pending'::text, 
  'work_assigned'::text, 
  'work_expiry_warning'::text, 
  'machinery_expiry_warning'::text, 
  'work_report_completed'::text, 
  'work_report_modified'::text, 
  'file_downloaded'::text, 
  'work_report_overdue'::text, 
  'new_user_pending'::text,
  'anomaly_detected'::text
]));
