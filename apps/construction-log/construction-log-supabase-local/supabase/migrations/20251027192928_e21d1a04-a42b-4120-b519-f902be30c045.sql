
-- Eliminar las organizaciones duplicadas y la organización incorrecta de Alejandro Benito
-- Solo mantenemos "Urdecon" que ya tiene todos los usuarios correctamente asignados

DELETE FROM public.organizations
WHERE id IN (
  '0f20cd20-1c77-4902-ad47-985f2011c368', -- URDECON (duplicado)
  'df08d30a-572f-4078-b107-b461bcbf2884'  -- Alejandro Benito - Organización
);
