-- Función para enviar notificación cuando se asigna una obra
CREATE OR REPLACE FUNCTION notify_work_assignment()
RETURNS TRIGGER AS $$
DECLARE
  work_name_value TEXT;
  work_number_value TEXT;
  org_id UUID;
BEGIN
  -- Obtener información de la obra
  SELECT name, number, organization_id 
  INTO work_name_value, work_number_value, org_id
  FROM works 
  WHERE id = NEW.work_id;
  
  -- Crear notificación para el usuario asignado
  INSERT INTO notifications (
    user_id,
    organization_id,
    type,
    title,
    message,
    related_id,
    read
  ) VALUES (
    NEW.user_id,
    org_id,
    'work_assigned',
    'Nueva obra asignada',
    'Se te ha asignado la obra "' || work_name_value || '" (' || work_number_value || ')',
    NEW.work_id,
    false
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para notificar al asignar obra
DROP TRIGGER IF EXISTS on_work_assignment ON work_assignments;
CREATE TRIGGER on_work_assignment
  AFTER INSERT ON work_assignments
  FOR EACH ROW
  EXECUTE FUNCTION notify_work_assignment();