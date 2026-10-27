import {
  CATALOGO_V1,
  seccionDeApi,
  seccionDeRuta,
  type FuenteSecciones,
  type SeccionId,
} from '@contracts/emp/company-sections';
import { fuenteSecciones } from './fuente';

export interface RutaApiLibre {
  ruta: string;
  /** true: solo la ruta exacta; false: la ruta y sus subrutas por segmento. */
  exacta: boolean;
  motivo: 'cuenta-sesion' | 'sistema';
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
