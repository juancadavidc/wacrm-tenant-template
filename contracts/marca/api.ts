/**
 * Contrato I1 del PRD wacrm-marca-ui: API de marca (`/api/marca`).
 *
 * Publica: MRC (MRC.2). Consume: PNL (PNL.1).
 *
 * Códigos por método:
 *   GET    200 | 403
 *   PUT    200 | 400 | 403 | 413   (multipart: nombre, color, logo, icono)
 *   DELETE 200 | 400 | 403         (?campo=logo|icono|color|nombre)
 *
 * Regla de estabilidad: este contrato no se cambia desde el repo de código;
 * ver contracts/README.md.
 */
import { z } from 'zod';

export const VERSION_CONTRATO = 1;
export const RUTA_API_MARCA = '/api/marca';

export const CAMPOS = ['nombre', 'logo', 'icono', 'color'] as const;
export const CampoSchema = z.enum(CAMPOS);
export type Campo = z.infer<typeof CampoSchema>;

/** base = guardado desde la UI, config = `config/` de la empresa, defecto = Stackless. */
export const FUENTES = ['base', 'config', 'defecto'] as const;
export const FuenteSchema = z.enum(FUENTES);
export type Fuente = z.infer<typeof FuenteSchema>;

export const TIPOS_IMAGEN = [
  'image/png',
  'image/svg+xml',
  'image/webp',
] as const;
export const LOGO_MAX_BYTES = 1024 * 1024;
export const ICONO_MAX_BYTES = 512 * 1024;
export const LIMITE_CUERPO_BYTES = 2 * 1024 * 1024;
export const NOMBRE_MAX = 60;
export const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export const MOTIVOS = {
  nombre: ['vacio', 'muy-largo'],
  color: ['formato'],
  logo: ['tipo', 'muy-pesado'],
  icono: ['tipo', 'muy-pesado'],
} as const;
export type Motivo<C extends Campo> = (typeof MOTIVOS)[C][number];

export const MarcaApiSchema = z.strictObject({
  marca: z.strictObject({
    nombre: z.string().min(1).max(NOMBRE_MAX),
    color: z.string().regex(COLOR_RE),
    logoUrl: z.string().startsWith('/marca/'),
    iconoUrl: z.string().startsWith('/marca/'),
  }),
  fuentes: z.strictObject({
    nombre: FuenteSchema,
    logo: FuenteSchema,
    icono: FuenteSchema,
    color: FuenteSchema,
  }),
});
export type MarcaApi = z.infer<typeof MarcaApiSchema>;

export const RespuestaPutSchema = MarcaApiSchema.extend({
  avisos: z.array(
    z.strictObject({
      campo: z.literal('icono'),
      aviso: z.literal('no-cuadrado'),
    })
  ),
});
export type RespuestaPut = z.infer<typeof RespuestaPutSchema>;

export const ErrorValidacionSchema = z.strictObject({
  error: z.literal('validacion'),
  campos: z
    .strictObject({
      nombre: z.enum(MOTIVOS.nombre).optional(),
      color: z.enum(MOTIVOS.color).optional(),
      logo: z.enum(MOTIVOS.logo).optional(),
      icono: z.enum(MOTIVOS.icono).optional(),
    })
    .refine((c) => Object.values(c).some((v) => v !== undefined), {
      message: 'al menos un campo con motivo',
    }),
});
export type ErrorValidacion = z.infer<typeof ErrorValidacionSchema>;

export const ErrorSimpleSchema = z.strictObject({
  error: z.enum([
    'sin-campos',
    'campo-invalido',
    'sin-permiso',
    'cuerpo-muy-pesado',
  ]),
});
export type ErrorSimple = z.infer<typeof ErrorSimpleSchema>;

/** Un `File` lo cumple. */
export type ArchivoEntrada = { type: string; size: number };
export type EntradaPut = {
  nombre?: string;
  color?: string;
  logo?: ArchivoEntrada;
  icono?: ArchivoEntrada;
};

export type ResultadoPut =
  | { ok: true; valores: { nombre?: string; color?: string } }
  | { ok: false; error: 'sin-campos' }
  | { ok: false; error: 'validacion'; campos: ErrorValidacion['campos'] };

function motivoArchivo(
  f: ArchivoEntrada,
  max: number
): 'tipo' | 'muy-pesado' | undefined {
  if (!(TIPOS_IMAGEN as readonly string[]).includes(f.type)) return 'tipo';
  if (f.size > max) return 'muy-pesado';
  return undefined;
}

/**
 * Regla de validación del PUT (R6, R7, R8). Revisa todos los campos presentes
 * y junta todos los motivos; si uno falla, no se guarda ninguno.
 */
export function validarPut(e: EntradaPut): ResultadoPut {
  const presentes = [e.nombre, e.color, e.logo, e.icono].some(
    (v) => v !== undefined
  );
  if (!presentes) return { ok: false, error: 'sin-campos' };

  const campos: ErrorValidacion['campos'] = {};
  const valores: { nombre?: string; color?: string } = {};

  if (e.nombre !== undefined) {
    const n = e.nombre.trim();
    if (n.length === 0) campos.nombre = 'vacio';
    else if (n.length > NOMBRE_MAX) campos.nombre = 'muy-largo';
    else valores.nombre = n;
  }
  if (e.color !== undefined) {
    if (COLOR_RE.test(e.color)) valores.color = e.color;
    else campos.color = 'formato';
  }
  if (e.logo !== undefined) {
    const m = motivoArchivo(e.logo, LOGO_MAX_BYTES);
    if (m) campos.logo = m;
  }
  if (e.icono !== undefined) {
    const m = motivoArchivo(e.icono, ICONO_MAX_BYTES);
    if (m) campos.icono = m;
  }

  if (Object.keys(campos).length > 0) {
    return { ok: false, error: 'validacion', campos };
  }
  return { ok: true, valores };
}

export const ROLES_MARCA = ['owner', 'admin', 'usuario', 'superadmin'] as const;
export type RolMarca = (typeof ROLES_MARCA)[number];

/** R5: solo owner y superadmin editan (y ven) la marca. */
export function permiteEditarMarca(rol: RolMarca): boolean {
  return rol === 'owner' || rol === 'superadmin';
}

export type RespuestaApi<T> =
  | { status: 200; body: T }
  | { status: 400; body: ErrorValidacion | ErrorSimple }
  | { status: 403 | 413; body: ErrorSimple };
