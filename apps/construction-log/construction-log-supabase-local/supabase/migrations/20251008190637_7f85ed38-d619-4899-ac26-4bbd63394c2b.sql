-- Función para eliminar partes de trabajo duplicados
-- Mantiene el parte más antiguo (el primero creado) y elimina los demás
CREATE OR REPLACE FUNCTION delete_duplicate_work_reports()
RETURNS TABLE (
  deleted_count INTEGER,
  message TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_deleted_count INTEGER := 0;
  v_duplicate_record RECORD;
  v_ids_to_delete UUID[];
BEGIN
  -- Buscar y eliminar duplicados
  FOR v_duplicate_record IN
    SELECT 
      work_id,
      date,
      created_by,
      work_name,
      work_number,
      array_agg(id ORDER BY created_at) as all_ids
    FROM work_reports
    GROUP BY work_id, date, created_by, work_name, work_number
    HAVING COUNT(*) > 1
  LOOP
    -- Obtener todos los IDs excepto el primero (el más antiguo)
    v_ids_to_delete := v_duplicate_record.all_ids[2:array_length(v_duplicate_record.all_ids, 1)];
    
    -- Eliminar los duplicados
    DELETE FROM work_reports
    WHERE id = ANY(v_ids_to_delete);
    
    -- Contar cuántos se eliminaron
    v_deleted_count := v_deleted_count + array_length(v_ids_to_delete, 1);
  END LOOP;
  
  RETURN QUERY SELECT v_deleted_count, 
    'Se eliminaron ' || v_deleted_count || ' partes de trabajo duplicados' AS message;
END;
$$;

-- Ejecutar la función para limpiar duplicados
SELECT * FROM delete_duplicate_work_reports();