-- Función para completar nombres de encargados en partes existentes
CREATE OR REPLACE FUNCTION public.fill_missing_foreman_names()
RETURNS TABLE(updated_count INTEGER, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_updated_count INTEGER := 0;
  v_work_report RECORD;
  v_foreman_name TEXT;
BEGIN
  -- Iterar sobre todos los partes que tienen work_id pero no tienen foreman o está vacío
  FOR v_work_report IN
    SELECT id, work_id
    FROM work_reports
    WHERE work_id IS NOT NULL
      AND (foreman IS NULL OR foreman = '')
  LOOP
    -- Buscar el encargado asignado a esta obra
    SELECT p.full_name INTO v_foreman_name
    FROM work_assignments wa
    JOIN user_roles ur ON ur.user_id = wa.user_id
    JOIN profiles p ON p.id = wa.user_id
    WHERE wa.work_id = v_work_report.work_id
      AND ur.role = 'foreman'
      AND p.approved = true
    LIMIT 1;
    
    -- Si se encontró un encargado, actualizar el parte
    IF v_foreman_name IS NOT NULL THEN
      UPDATE work_reports
      SET foreman = v_foreman_name
      WHERE id = v_work_report.id;
      
      v_updated_count := v_updated_count + 1;
    END IF;
  END LOOP;
  
  RETURN QUERY SELECT v_updated_count, 
    'Se actualizaron ' || v_updated_count || ' partes de trabajo con nombres de encargados';
END;
$$;

-- Ejecutar la función para completar los nombres
SELECT * FROM public.fill_missing_foreman_names();

-- Función similar para jefes de obra
CREATE OR REPLACE FUNCTION public.fill_missing_site_manager_names()
RETURNS TABLE(updated_count INTEGER, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_updated_count INTEGER := 0;
  v_work_report RECORD;
  v_site_manager_name TEXT;
BEGIN
  -- Iterar sobre todos los partes que tienen work_id pero no tienen site_manager o está vacío
  FOR v_work_report IN
    SELECT id, work_id
    FROM work_reports
    WHERE work_id IS NOT NULL
      AND (site_manager IS NULL OR site_manager = '')
  LOOP
    -- Buscar el jefe de obra asignado a esta obra
    SELECT p.full_name INTO v_site_manager_name
    FROM work_assignments wa
    JOIN user_roles ur ON ur.user_id = wa.user_id
    JOIN profiles p ON p.id = wa.user_id
    WHERE wa.work_id = v_work_report.work_id
      AND ur.role = 'site_manager'
      AND p.approved = true
    LIMIT 1;
    
    -- Si se encontró un jefe de obra, actualizar el parte
    IF v_site_manager_name IS NOT NULL THEN
      UPDATE work_reports
      SET site_manager = v_site_manager_name
      WHERE id = v_work_report.id;
      
      v_updated_count := v_updated_count + 1;
    END IF;
  END LOOP;
  
  RETURN QUERY SELECT v_updated_count, 
    'Se actualizaron ' || v_updated_count || ' partes de trabajo con nombres de jefes de obra';
END;
$$;

-- Ejecutar la función para completar los nombres de jefes de obra
SELECT * FROM public.fill_missing_site_manager_names();