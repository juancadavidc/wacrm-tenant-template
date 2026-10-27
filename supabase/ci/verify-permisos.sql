-- Asserts del esquema de permisos_001_secciones.sql (EMP.1).
DO $$
DECLARE t text;
BEGIN
  IF to_regclass('public.permisos_secciones') IS NULL THEN
    RAISE EXCEPTION 'falta permisos_secciones';
  END IF;
  IF to_regclass('public.permisos_secciones_cuenta') IS NULL THEN
    RAISE EXCEPTION 'falta permisos_secciones_cuenta';
  END IF;
  IF (SELECT array_agg(id ORDER BY orden) FROM permisos_secciones
      WHERE prendida_por_defecto) IS DISTINCT FROM
     array['dashboard','inbox','notifications','contacts','pipelines',
           'broadcasts','automations','flows','agents','settings'] THEN
    RAISE EXCEPTION 'el catalogo v1 sembrado no coincide';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'permisos_secciones_cuenta_nueva'
      AND tgrelid = 'public.accounts'::regclass
  ) THEN
    RAISE EXCEPTION 'falta el trigger permisos_secciones_cuenta_nueva';
  END IF;

  -- Grants de permisos_002_perfiles.sql (USR.1): lectura para authenticated,
  -- escritura solo service_role.
  FOREACH t IN ARRAY array['permisos_perfiles','permisos_perfil_usuario'] LOOP
    IF NOT has_table_privilege('authenticated', 'public.' || t, 'SELECT') THEN
      RAISE EXCEPTION 'authenticated sin SELECT en %', t;
    END IF;
    IF has_table_privilege('authenticated', 'public.' || t, 'INSERT')
       OR has_table_privilege('authenticated', 'public.' || t, 'UPDATE')
       OR has_table_privilege('authenticated', 'public.' || t, 'DELETE') THEN
      RAISE EXCEPTION 'authenticated no debe escribir en %', t;
    END IF;
  END LOOP;
  FOREACH t IN ARRAY array['permisos_hitos','permisos_perfiles','permisos_perfil_usuario'] LOOP
    IF NOT has_table_privilege('service_role', 'public.' || t, 'INSERT') THEN
      RAISE EXCEPTION 'service_role sin escritura en %', t;
    END IF;
  END LOOP;

  -- permisos_003_gestion_perfiles.sql (USR.2): las RPC las llama authenticated,
  -- anon no; los triggers de R21 existen.
  IF NOT has_function_privilege('authenticated',
       'public.permisos_guardar_perfil(uuid,text,text[])', 'EXECUTE')
     OR NOT has_function_privilege('authenticated',
       'public.permisos_asignar_perfil(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated sin EXECUTE en las RPC de perfiles';
  END IF;
  IF has_function_privilege('anon',
       'public.permisos_guardar_perfil(uuid,text,text[])', 'EXECUTE')
     OR has_function_privilege('anon',
       'public.permisos_asignar_perfil(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon no debe ejecutar las RPC de perfiles';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'permisos_r21_rol'
      AND tgrelid = 'public.profiles'::regclass
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'permisos_r21_invitacion'
      AND tgrelid = 'public.account_invitations'::regclass
  ) THEN
    RAISE EXCEPTION 'faltan los triggers de R21';
  END IF;
END $$;
