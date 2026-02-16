-- Añadir campos de firma digital para encargado y jefe de obra en work_reports
ALTER TABLE public.work_reports
ADD COLUMN foreman_signature text,
ADD COLUMN site_manager_signature text;