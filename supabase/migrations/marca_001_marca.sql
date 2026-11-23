-- ============================================================
-- marca_001_marca.sql
--
-- Marca de la instalación guardada desde la UI (PRD wacrm-marca-ui, MRC.1):
-- tabla de una sola fila `marca_instalacion` y bucket privado `marca`.
--
-- Todas las columnas de marca son nulas: nula = no hay valor de la UI y la
-- app cae a config/ y luego a Stackless. Sin fila = base vacía.
-- Sin acceso para anon ni authenticated: solo service_role (la app lee y
-- escribe en el servidor).
--
-- Convención de rutas en el bucket (para MRC.2): cada subida usa una ruta
-- nueva, `logo/<sha256-16 del contenido>.<ext>` o `icono/<...>.<ext>`.
--
-- Idempotente — safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.marca_instalacion (
  id boolean PRIMARY KEY DEFAULT TRUE,
  nombre text,
  color text,
  logo_ruta text,
  icono_ruta text,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_por uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT marca_instalacion_una_fila CHECK (id)
);

ALTER TABLE public.marca_instalacion
  DROP CONSTRAINT IF EXISTS marca_instalacion_color_check;
ALTER TABLE public.marca_instalacion
  ADD CONSTRAINT marca_instalacion_color_check
  CHECK (color IS NULL OR color ~ '^#[0-9a-fA-F]{6}$');

ALTER TABLE public.marca_instalacion
  DROP CONSTRAINT IF EXISTS marca_instalacion_nombre_check;
ALTER TABLE public.marca_instalacion
  ADD CONSTRAINT marca_instalacion_nombre_check
  CHECK (nombre IS NULL OR char_length(btrim(nombre)) BETWEEN 1 AND 60);

ALTER TABLE public.marca_instalacion ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.marca_instalacion FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marca_instalacion TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'marca',
  'marca',
  FALSE,
  1048576, -- 1 MB
  ARRAY['image/png', 'image/svg+xml', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
