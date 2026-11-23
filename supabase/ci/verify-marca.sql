-- Asserts del esquema de marca_001_marca.sql (MRC.1).
DO $$
BEGIN
  IF to_regclass('public.marca_instalacion') IS NULL THEN
    RAISE EXCEPTION 'falta marca_instalacion';
  END IF;
  IF has_table_privilege('anon', 'public.marca_instalacion', 'SELECT')
     OR has_table_privilege('authenticated', 'public.marca_instalacion', 'SELECT') THEN
    RAISE EXCEPTION 'anon y authenticated no deben leer marca_instalacion';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.marca_instalacion', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.marca_instalacion', 'INSERT') THEN
    RAISE EXCEPTION 'service_role sin SELECT/INSERT en marca_instalacion';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class
          WHERE oid = 'public.marca_instalacion'::regclass) THEN
    RAISE EXCEPTION 'RLS apagado en marca_instalacion';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'marca' AND public = FALSE) THEN
    RAISE EXCEPTION 'falta el bucket privado marca';
  END IF;
END $$;
