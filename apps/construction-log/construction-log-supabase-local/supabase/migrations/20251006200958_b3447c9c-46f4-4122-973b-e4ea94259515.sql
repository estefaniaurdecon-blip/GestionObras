-- Crear trigger para auto-asignar al site_manager cuando crea una obra
CREATE OR REPLACE FUNCTION public.auto_assign_creator_to_work()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Asignar automáticamente al creador de la obra
  IF NEW.created_by IS NOT NULL THEN
    INSERT INTO public.work_assignments (user_id, work_id, created_by)
    VALUES (NEW.created_by, NEW.id, NEW.created_by)
    ON CONFLICT DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Crear el trigger en la tabla works
DROP TRIGGER IF EXISTS auto_assign_creator_on_work_create ON public.works;
CREATE TRIGGER auto_assign_creator_on_work_create
  AFTER INSERT ON public.works
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_assign_creator_to_work();