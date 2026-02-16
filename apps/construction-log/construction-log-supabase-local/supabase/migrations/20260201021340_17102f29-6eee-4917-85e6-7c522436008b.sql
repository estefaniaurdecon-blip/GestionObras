-- Fix: Cambiar la vista active_containers para que use SECURITY INVOKER (por defecto)
-- en lugar de SECURITY DEFINER, respetando las políticas RLS del usuario que consulta

DROP VIEW IF EXISTS public.active_containers;

-- Recrear la vista con SECURITY INVOKER explícito (es el comportamiento por defecto)
CREATE VIEW public.active_containers 
WITH (security_invoker = on)
AS
SELECT 
  e.container_id,
  e.container_size,
  e.waste_type_id,
  wt.name as waste_type_name,
  e.manager_id,
  wm.company_name as manager_name,
  e.work_id,
  w.name as work_name,
  e.created_at as delivery_date,
  e.organization_id
FROM public.work_report_waste_entries e
LEFT JOIN public.waste_types wt ON e.waste_type_id = wt.id
LEFT JOIN public.waste_managers wm ON e.manager_id = wm.id
LEFT JOIN public.works w ON e.work_id = w.id
WHERE e.operation_mode = 'container_management'
  AND e.action_type = 'delivery'
  AND e.container_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.work_report_waste_entries withdrawal
    WHERE withdrawal.container_id = e.container_id
      AND withdrawal.work_id = e.work_id
      AND withdrawal.action_type IN ('withdrawal', 'exchange')
      AND withdrawal.created_at > e.created_at
  );

COMMENT ON VIEW public.active_containers IS 'Contenedores actualmente presentes en cada obra (usa RLS del usuario)';