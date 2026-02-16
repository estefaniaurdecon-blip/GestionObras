-- Eliminar versión 2.0.3 de Android
DELETE FROM app_versions 
WHERE platform = 'android' 
  AND version = '2.0.3';