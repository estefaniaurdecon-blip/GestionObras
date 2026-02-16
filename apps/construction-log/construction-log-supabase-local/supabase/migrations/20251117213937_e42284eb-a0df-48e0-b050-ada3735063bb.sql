-- Habilitar replica identity full para la tabla access_control_reports
ALTER TABLE access_control_reports REPLICA IDENTITY FULL;

-- Añadir la tabla a la publicación de realtime
ALTER PUBLICATION supabase_realtime ADD TABLE access_control_reports;