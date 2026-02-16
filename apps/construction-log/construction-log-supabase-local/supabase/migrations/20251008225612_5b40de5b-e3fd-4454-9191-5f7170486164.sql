-- Eliminar todas las notificaciones anteriores a la fecha actual
DELETE FROM notifications 
WHERE created_at < NOW();