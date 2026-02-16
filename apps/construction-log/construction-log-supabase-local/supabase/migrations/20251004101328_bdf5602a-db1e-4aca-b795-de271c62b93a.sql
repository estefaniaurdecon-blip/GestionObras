-- Función para auto-asignar al jefe de obra cuando asigna a otros
CREATE OR REPLACE FUNCTION public.auto_assign_site_manager_to_work()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Si el que está asignando es un site_manager y no está ya asignado a la obra
  IF NEW.created_by IS NOT NULL 
     AND has_role(NEW.created_by, 'site_manager') 
     AND NEW.user_id != NEW.created_by
     AND NOT EXISTS (
       SELECT 1 FROM public.work_assignments 
       WHERE user_id = NEW.created_by AND work_id = NEW.work_id
     ) THEN
    -- Asignar automáticamente al site_manager a la obra
    INSERT INTO public.work_assignments (user_id, work_id, created_by)
    VALUES (NEW.created_by, NEW.work_id, NEW.created_by);
  END IF;
  
  RETURN NEW;
END;
$$;

-- Crear trigger para ejecutar la función
CREATE TRIGGER trigger_auto_assign_site_manager
  AFTER INSERT ON public.work_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_assign_site_manager_to_work();