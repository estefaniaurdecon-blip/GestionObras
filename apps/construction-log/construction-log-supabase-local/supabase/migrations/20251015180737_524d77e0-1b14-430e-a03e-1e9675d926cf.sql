-- Crear perfil y rol para Pepe Flores (nueva empresa "Patatas fritas")
DO $$
DECLARE
  new_org_id UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = '588512f1-45b1-4d7b-a2f3-184b00a650e6') THEN
    -- Crear nueva organizaciÃ³n para "Patatas fritas"
    INSERT INTO public.organizations (name, subscription_status, trial_end_date)
    VALUES ('Patatas fritas', 'trial', now() + interval '7 days')
    RETURNING id INTO new_org_id;
    
    -- Crear perfil para Pepe Flores como admin aprobado
    INSERT INTO public.profiles (
      id,
      full_name,
      organization_id,
      approved,
      email,
      last_login
    )
    VALUES (
      '588512f1-45b1-4d7b-a2f3-184b00a650e6',
      'Pepe flores',
      new_org_id,
      true,
      'tonymoratalla3@gmail.com',
      now()
    )
    ON CONFLICT (id) DO NOTHING;
    
    -- Asignar rol de admin
    INSERT INTO public.user_roles (user_id, role, organization_id)
    VALUES (
      '588512f1-45b1-4d7b-a2f3-184b00a650e6',
      'admin'::app_role,
      new_org_id
    )
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- Crear perfil y rol para Alejandro Benito (unirse a Urdecon existente)
DO $$
DECLARE
  urdecon_org_id UUID;
BEGIN
  -- Buscar organizaciÃ³n Urdecon
  SELECT id INTO urdecon_org_id
  FROM public.organizations
  WHERE name = 'Urdecon'
  LIMIT 1;
  
  IF urdecon_org_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM auth.users WHERE id = 'ec2b92ea-6171-40fa-bf7f-e5e662621121') THEN
    -- Crear perfil para Alejandro (pendiente de aprobaciÃ³n porque se une a org existente)
    INSERT INTO public.profiles (
      id,
      full_name,
      organization_id,
      approved,
      email,
      last_login
    )
    VALUES (
      'ec2b92ea-6171-40fa-bf7f-e5e662621121',
      'Alejandro Benito',
      urdecon_org_id,
      false,  -- Pendiente de aprobaciÃ³n
      'abenito@urdecon.es',
      now()
    )
    ON CONFLICT (id) DO NOTHING;
    
    -- Asignar rol de foreman (pendiente de cambio por admin)
    INSERT INTO public.user_roles (user_id, role, organization_id)
    VALUES (
      'ec2b92ea-6171-40fa-bf7f-e5e662621121',
      'foreman'::app_role,
      urdecon_org_id
    )
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
