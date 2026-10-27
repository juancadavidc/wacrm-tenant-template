import {
  CATALOGO_V1,
  seccionDeApi,
  seccionDeRuta,
  type FuenteSecciones,
  type SeccionId,
} from '@contracts/emp/company-sections';
import {
  puedeUsar,
  type ObtenerPermisosEfectivos,
} from '@contracts/usr/effective-permissions';
import { fuenteSecciones } from './fuente';
import { obtenerPermisos } from './permisos';

export interface RutaApiLibre {
  ruta: string;
  /** true: solo la ruta exacta; false: la ruta y sus subrutas por segmento. */
  exacta: boolean;
  motivo: 'cuenta-sesion' | 'sistema' | 'superadmin';
  /**
   * Si está, la ruta solo es libre para GET/HEAD; cualquier otro método
   * se decide con esta sección (las escrituras no son lecturas compartidas).
   */
  seccionEscritura?: SeccionId;
}

const METODOS_LECTURA = ['GET', 'HEAD'];

/**
 * Rutas `/api` sin sección que siguen abiertas (R18). Todo lo demás sin
 * sección responde 403.
 */
export const RUTAS_API_LIBRES: readonly RutaApiLibre[] = [
  // cuenta y sesión
  { ruta: '/api/account', exacta: true, motivo: 'cuenta-sesion' },
  {
    ruta: '/api/account/transfer-ownership',
    exacta: true,
    motivo: 'cuenta-sesion',
  },
  { ruta: '/api/invitations', exacta: false, motivo: 'cuenta-sesion' },
  { ruta: '/api/v1/me', exacta: true, motivo: 'cuenta-sesion' },
  // lecturas compartidas entre secciones (RUTAS_API_DE_CUENTA de CT.1):
  // solo la raíz exacta; sus escrituras siguen con requireRole('admin')
  {
    ruta: '/api/account/members',
    exacta: true,
    motivo: 'cuenta-sesion',
    seccionEscritura: 'settings',
  },
  {
    ruta: '/api/ai/config',
    exacta: true,
    motivo: 'cuenta-sesion',
    seccionEscritura: 'agents',
  },
  // superadmin: el handler exige la marca y responde 403 a los demás
  { ruta: '/api/superadmin', exacta: false, motivo: 'superadmin' },
  // sistema: se autentican con firma o secreto
  { ruta: '/api/whatsapp/webhook', exacta: false, motivo: 'sistema' },
  { ruta: '/api/backup/cron', exacta: false, motivo: 'sistema' },
];

export type ClaseRuta =
  | { tipo: 'no-aplica' }
  | { tipo: 'libre' }
  | { tipo: 'sin-seccion' }
  | { tipo: 'seccion'; seccion: SeccionId; esApi: boolean };

function normalizar(pathname: string): string {
  let p = pathname.split('#')[0].split('?')[0];
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p;
}

function libreQueCasa(p: string): RutaApiLibre | undefined {
  return RUTAS_API_LIBRES.find((l) =>
    l.exacta ? p === l.ruta : p === l.ruta || p.startsWith(l.ruta + '/')
  );
}

export function clasificarRuta(
  pathname: string,
  metodo: string = 'GET'
): ClaseRuta {
  const p = normalizar(pathname);
  if (p === '/api' || p.startsWith('/api/')) {
    const seccion = seccionDeApi(CATALOGO_V1, p);
    if (seccion) return { tipo: 'seccion', seccion, esApi: true };
    const libre = libreQueCasa(p);
    if (!libre) return { tipo: 'sin-seccion' };
    if (
      libre.seccionEscritura &&
      !METODOS_LECTURA.includes(metodo.toUpperCase())
    ) {
      return { tipo: 'seccion', seccion: libre.seccionEscritura, esApi: true };
    }
    return { tipo: 'libre' };
  }
  const seccion = seccionDeRuta(CATALOGO_V1, p);
  return seccion
    ? { tipo: 'seccion', seccion, esApi: false }
    : { tipo: 'no-aplica' };
}

export type Decision =
  | { tipo: 'pasa' }
  | { tipo: 'apagada'; seccion: SeccionId }
  | { tipo: 'sin-permiso'; seccion: SeccionId; permitidas: SeccionId[] }
  | { tipo: 'sin-seccion' };

/** El único punto de decisión por sección contratada. Sin caché (R3). */
export async function decidirAcceso(
  pathname: string,
  cuentaId: string | null,
  fuente: FuenteSecciones = fuenteSecciones(),
  metodo: string = 'GET'
): Promise<Decision> {
  const clase = clasificarRuta(pathname, metodo);
  if (clase.tipo === 'no-aplica' || clase.tipo === 'libre') {
    return { tipo: 'pasa' };
  }
  if (clase.tipo === 'sin-seccion') return { tipo: 'sin-seccion' };
  if (!cuentaId) return { tipo: 'apagada', seccion: clase.seccion };
  try {
    const { secciones } = await fuente.contratadas(cuentaId);
    return secciones.includes(clase.seccion)
      ? { tipo: 'pasa' }
      : { tipo: 'apagada', seccion: clase.seccion };
  } catch (err) {
    console.error('[secciones] no se pudo leer las secciones contratadas', err);
    return { tipo: 'apagada', seccion: clase.seccion };
  }
}

export type Quien = {
  cuentaId: string | null;
  usuarioId: string;
  superadmin: boolean;
};

/**
 * Decisión para una sesión con usuario: permiso efectivo de I2 (perfil ∩
 * contratado). El superadmin queda fuera de I2 y sigue `decidirAcceso`.
 * Ante cualquier error, niega (05-reglas: por defecto, sin acceso).
 */
export async function decidirAccesoUsuario(
  pathname: string,
  quien: Quien,
  d: {
    obtener?: ObtenerPermisosEfectivos;
    fuente?: FuenteSecciones;
    metodo?: string;
  } = {}
): Promise<Decision> {
  const fuente = d.fuente ?? fuenteSecciones();
  const clase = clasificarRuta(pathname, d.metodo);
  if (clase.tipo === 'no-aplica' || clase.tipo === 'libre') {
    return { tipo: 'pasa' };
  }
  if (quien.superadmin) {
    return clase.tipo === 'sin-seccion'
      ? { tipo: 'pasa' }
      : decidirAcceso(pathname, quien.cuentaId, fuente, d.metodo);
  }
  if (clase.tipo === 'sin-seccion') return { tipo: 'sin-seccion' };
  const { seccion } = clase;
  const niega = (permitidas: SeccionId[] = []): Decision => ({
    tipo: 'sin-permiso',
    seccion,
    permitidas,
  });
  if (!quien.cuentaId) return niega();
  const obtener = d.obtener ?? obtenerPermisos();
  let p;
  try {
    p = await obtener({ cuentaId: quien.cuentaId, usuarioId: quien.usuarioId });
  } catch (err) {
    console.error('[permisos] no se pudo leer el permiso efectivo', err);
    return niega();
  }
  if (p === null) return niega();
  if (puedeUsar(p, seccion)) return { tipo: 'pasa' };
  const ids = new Set<string>(CATALOGO_V1.map((s) => s.id));
  const permitidas = p.secciones.filter((s) => ids.has(s)) as SeccionId[];
  try {
    const { secciones } = await fuente.contratadas(quien.cuentaId);
    if (!secciones.includes(seccion)) return { tipo: 'apagada', seccion };
  } catch (err) {
    console.error('[secciones] no se pudo leer las secciones contratadas', err);
  }
  return niega(permitidas);
}
