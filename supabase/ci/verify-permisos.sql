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
