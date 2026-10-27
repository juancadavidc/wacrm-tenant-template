-- Asserts del esquema de permisos_001_secciones.sql (EMP.1).
DO $$
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
END $$;

-- Grants de permisos_002_perfiles.sql (USR.1): lectura para authenticated,
-- escritura solo service_role.
DO $$
DECLARE t text;
BEGIN
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
END $$;
