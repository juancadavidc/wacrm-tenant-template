/**
 * Contrato de la interfaz I2 (PRD wacrm-marca-ui): marca efectiva y rutas de
 * archivos (`/marca/logo`, `/marca/icono`).
 * Publica: MRC (MRC.1)
 * Consumen: PNL (PNL.1), HIJ
 *
 * Fuente: prd-hub, prds/wacrm-marca-ui/slices/CT.2-contrato-marca-efectiva.md
 * (origen 04-modulos#i2). No lo cambies sin actualizar antes el PRD.
 *
 * Convención de contracts/: `<nombre>.ts` (contrato), `<nombre>.stub.ts` (stub),
 * `<nombre>.cdc-<consumidor>.test.ts` (CDC) y `<nombre>.publicador.test.ts`
 * (verificación del publicador, pendiente hasta que lo implemente su slice).
 */
import { z } from 'zod';
import { FUENTES, FuenteSchema, NOMBRE_MAX, type Fuente } from './api';

export { FUENTES, FuenteSchema };
export type { Fuente };

export const VERSION_CONTRATO = 1;

export const CAMPOS_MARCA = ['nombre', 'logo', 'icono', 'color'] as const;
export type CampoMarca = (typeof CAMPOS_MARCA)[number];

export const RUTAS_MARCA = {
  logo: '/marca/logo',
  icono: '/marca/icono',
} as const;

/** Versión reservada: la marca de Stackless (fuente `defecto`). */
export const VERSION_DEFECTO = 'defecto';
export const URL_LOGO_DEFECTO = `${RUTAS_MARCA.logo}?v=${VERSION_DEFECTO}`;
export const NOMBRE_DEFECTO = 'Stackless';
export const COLOR_DEFECTO = '#2f7bf5';

export const TIPOS_ARCHIVO_MARCA = [
  'image/png',
  'image/svg+xml',
  'image/webp',
] as const;
export type TipoArchivoMarca = (typeof TIPOS_ARCHIVO_MARCA)[number];

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const VERSION_RE = /^[A-Za-z0-9_-]{1,64}$/;

export const VersionSchema = z.string().regex(VERSION_RE);

type Archivo = 'logo' | 'icono';

/** `/marca/logo?v=<version>`; lanza si la versión es inválida o reservada. */
export function urlConVersion(archivo: Archivo, version: string): string {
  if (!VERSION_RE.test(version) || version === VERSION_DEFECTO) {
    throw new Error(`versión inválida: ${version}`);
  }
  return `${RUTAS_MARCA[archivo]}?v=${version}`;
}

function versionPropia(url: string, archivo: Archivo): string | null {
  const prefijo = `${RUTAS_MARCA[archivo]}?v=`;
  if (!url.startsWith(prefijo)) return null;
  const v = url.slice(prefijo.length);
  return VERSION_RE.test(v) && v !== VERSION_DEFECTO ? v : null;
}

export const MarcaSchema = z
  .strictObject({
    nombre: z
      .string()
      .refine(
        (s) => s.trim() === s && s.length >= 1 && s.length <= NOMBRE_MAX,
        {
          message: `nombre sin espacios en los extremos, de 1 a ${NOMBRE_MAX} caracteres`,
        }
      ),
    color: z.string().regex(COLOR_RE),
    logoUrl: z.string(),
    iconoUrl: z.string(),
    /** Alias de `iconoUrl` para consumidores viejos. */
    marcaUrl: z.string(),
    fuentes: z.strictObject({
      nombre: FuenteSchema,
      logo: FuenteSchema,
      icono: FuenteSchema,
      color: FuenteSchema,
    }),
  })
  .superRefine((m, ctx) => {
    const error = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });

    if (m.marcaUrl !== m.iconoUrl) {
      error('marcaUrl', 'marcaUrl debe ser igual a iconoUrl');
    }

    if (m.fuentes.logo === 'defecto') {
      if (m.logoUrl !== URL_LOGO_DEFECTO) {
        error('logoUrl', `con fuente defecto debe ser ${URL_LOGO_DEFECTO}`);
      }
    } else if (versionPropia(m.logoUrl, 'logo') === null) {
      error('logoUrl', 'logo propio: /marca/logo?v=<versión válida>');
    }

    if (m.iconoUrl.startsWith(RUTAS_MARCA.icono)) {
      if (m.fuentes.icono === 'defecto') {
        error('fuentes', 'un ícono propio no puede tener fuente defecto');
      }
      if (versionPropia(m.iconoUrl, 'icono') === null) {
        error('iconoUrl', 'ícono propio: /marca/icono?v=<versión válida>');
      }
    } else {
      if (m.iconoUrl !== m.logoUrl) {
        error('iconoUrl', 'sin ícono propio, iconoUrl debe ser logoUrl');
      }
      if (m.fuentes.icono !== m.fuentes.logo) {
        error('fuentes', 'sin ícono propio, fuentes.icono es fuentes.logo');
      }
    }
  });
export type Marca = z.infer<typeof MarcaSchema>;

/** Lo que una fuente (base o `config/`) aporta: valores crudos, sin validar. */
export type CandidatoMarca = {
  nombre?: string;
  color?: string;
  logo?: { version: string };
  icono?: { version: string };
};

function primero<T>(
  fuentes: [Fuente, T | undefined][],
  valido: (v: T) => boolean
): { fuente: Fuente; valor: T } | null {
  for (const [fuente, valor] of fuentes) {
    if (valor !== undefined && valido(valor)) return { fuente, valor };
  }
  return null;
}

/**
 * R1 y R2: por campo, el primer valor válido en el orden base, config,
 * defecto. Sin ícono propio, el ícono es el logo. Pura, sin I/O ni caché.
 */
export function armarMarca(c: {
  base?: CandidatoMarca;
  config?: CandidatoMarca;
}): Marca {
  const { base, config } = c;
  const versionOk = (x: { version: string }) =>
    typeof x?.version === 'string' &&
    VERSION_RE.test(x.version) &&
    x.version !== VERSION_DEFECTO;

  const nombre = primero(
    [
      ['base', base?.nombre],
      ['config', config?.nombre],
    ],
    (v) =>
      typeof v === 'string' &&
      v.trim().length >= 1 &&
      v.trim().length <= NOMBRE_MAX
  );
  const color = primero(
    [
      ['base', base?.color],
      ['config', config?.color],
    ],
    (v) => typeof v === 'string' && COLOR_RE.test(v)
  );
  const logo = primero(
    [
      ['base', base?.logo],
      ['config', config?.logo],
    ],
    versionOk
  );
  const icono = primero(
    [
      ['base', base?.icono],
      ['config', config?.icono],
    ],
    versionOk
  );

  const logoUrl = logo
    ? urlConVersion('logo', logo.valor.version)
    : URL_LOGO_DEFECTO;
  const fuenteLogo: Fuente = logo ? logo.fuente : 'defecto';
  const iconoUrl = icono
    ? urlConVersion('icono', icono.valor.version)
    : logoUrl;

  return {
    nombre: nombre ? nombre.valor.trim() : NOMBRE_DEFECTO,
    color: color ? color.valor : COLOR_DEFECTO,
    logoUrl,
    iconoUrl,
    marcaUrl: iconoUrl,
    fuentes: {
      nombre: nombre ? nombre.fuente : 'defecto',
      logo: fuenteLogo,
      icono: icono ? icono.fuente : fuenteLogo,
      color: color ? color.fuente : 'defecto',
    },
  };
}

/** El logo es propio (no es el de Stackless). */
export function tieneLogoPropio(m: Marca): boolean {
  return m.fuentes.logo !== 'defecto';
}

/**
 * Forma de las rutas `/marca/logo` y `/marca/icono` (R6, R10). Devuelve los
 * motivos por los que una respuesta no cumple; vacía = cumple. Un 404 no lleva
 * cuerpo ni headers obligatorios; cualquier otro status que no sea 200 incumple. Cache-Control no es parte de I2.
 */
export function verificarRespuestaArchivo(res: Response): string[] {
  if (res.status === 404) return [];
  if (res.status !== 200) {
    return [`status no permitido: ${res.status} (solo 200 o 404)`];
  }
  const motivos: string[] = [];
  const tipo = (res.headers.get('content-type') ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (!(TIPOS_ARCHIVO_MARCA as readonly string[]).includes(tipo)) {
    motivos.push(`Content-Type no aceptado: ${tipo || '(ausente)'}`);
  }
  if (res.headers.get('x-content-type-options')?.toLowerCase() !== 'nosniff') {
    motivos.push('falta X-Content-Type-Options: nosniff');
  }
  const directivas = (res.headers.get('content-security-policy') ?? '')
    .split(';')
    .map((d) => d.trim().toLowerCase());
  if (!directivas.includes('sandbox')) {
    motivos.push('falta la directiva sandbox en Content-Security-Policy');
  }
  return motivos;
}

/** Firma de `leerMarca()` (async y sin parámetros: lee la base y `config/`). */
export type LeerMarca = () => Promise<Marca>;
