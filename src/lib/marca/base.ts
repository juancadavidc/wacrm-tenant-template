import { createHash } from 'node:crypto';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { CandidatoMarca } from '@contracts/marca/marca';
import { supabaseServerUrl } from '@/lib/supabase/internal-url';
import { TIPOS_LOGO } from './tipos';

/*
 * Lectura de la marca guardada desde la UI (tabla `marca_instalacion` y
 * bucket `marca`). Este módulo no importa `marca.ts` (evita el ciclo).
 *
 * Convención de rutas para MRC.2: cada subida usa una ruta nueva,
 * `logo/<sha256-16 del contenido>.<ext>` o `icono/<...>.<ext>`; nunca se
 * sobrescribe la misma ruta. La versión de la URL sale de la ruta, así que
 * cambia cuando cambia el archivo.
 */

export const TABLA_MARCA = 'marca_instalacion';
export const BUCKET_MARCA = 'marca';
export const TTL_MARCA_MS = 60_000;
export const TTL_FALLO_MS = 5_000;
export const TIMEOUT_BASE_MS = 2_000;

export type FilaMarca = {
  nombre: string | null;
  color: string | null;
  logo_ruta: string | null;
  icono_ruta: string | null;
  actualizado_en: string;
  actualizado_por: string | null;
};

// Un cliente por proceso (y por combinación url/llave/timeout): cada cliente
// nuevo arranca timers de auth que nadie detiene y la memoria crecería.
const clientesMarca = new Map<string, SupabaseClient>();

/** Cliente de service role con timeout, memoizado. Lanza si falta URL o llave. */
export function clienteMarca(
  opciones: { timeoutMs?: number } = {}
): SupabaseClient {
  const url = supabaseServerUrl();
  const llave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !llave) throw new Error('Supabase no está configurado');
  const timeoutMs = opciones.timeoutMs ?? TIMEOUT_BASE_MS;
  const clave = `${url}|${llave}|${timeoutMs}`;
  const existente = clientesMarca.get(clave);
  if (existente) return existente;
  const cliente = createClient(url, llave, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (entrada, init) =>
        fetch(entrada, { ...init, signal: AbortSignal.timeout(timeoutMs) }),
    },
  });
  clientesMarca.set(clave, cliente);
  return cliente;
}

/** Lee la fila única. `null` sin fila; lanza si hay error. */
export async function leerFilaMarca(
  cliente: SupabaseClient = clienteMarca()
): Promise<FilaMarca | null> {
  const { data, error } = await cliente
    .from(TABLA_MARCA)
    .select(
      'nombre, color, logo_ruta, icono_ruta, actualizado_en, actualizado_por'
    )
    .retry(false)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as FilaMarca | null) ?? null;
}

/** Primeros 16 hex de sha256(ruta). */
export function versionDeRuta(ruta: string): string {
  return createHash('sha256').update(ruta).digest('hex').slice(0, 16);
}

/** Ruta, tipo y versión de un archivo de la base; null si no es válido. */
export function archivoDeRuta(
  ruta: string | null
): { ruta: string; tipo: string; version: string } | null {
  if (!ruta) return null;
  const tipo = TIPOS_LOGO[path.extname(ruta).toLowerCase()];
  if (!tipo) return null;
  return { ruta, tipo, version: versionDeRuta(ruta) };
}

/** Candidato de la base: solo los campos presentes y válidos. */
export function candidatoBase(fila: FilaMarca | null): CandidatoMarca {
  if (!fila) return {};
  const candidato: CandidatoMarca = {};
  if (fila.nombre) candidato.nombre = fila.nombre;
  if (fila.color) candidato.color = fila.color;
  const logo = archivoDeRuta(fila.logo_ruta);
  if (logo) candidato.logo = { version: logo.version };
  const icono = archivoDeRuta(fila.icono_ruta);
  if (icono) candidato.icono = { version: icono.version };
  return candidato;
}

/** Caché de la fila: TTL largo si leyó, corto si falló (devuelve null). */
export function crearCacheFila(deps: {
  leer: () => Promise<FilaMarca | null>;
  ahora?: () => number;
}): { obtener(): Promise<FilaMarca | null>; invalidar(): void } {
  const ahora = deps.ahora ?? Date.now;
  let vence = -1;
  let pendiente: Promise<FilaMarca | null> | null = null;
  let valor: FilaMarca | null = null;
  let generacion = 0;

  return {
    obtener() {
      if (pendiente) return pendiente;
      if (ahora() <= vence) return Promise.resolve(valor);
      const mia = generacion;
      const propia: Promise<FilaMarca | null> = Promise.resolve()
        .then(() => deps.leer())
        .then((fila) => {
          if (mia === generacion) {
            valor = fila;
            vence = ahora() + TTL_MARCA_MS;
          }
          return fila;
        })
        .catch((e: unknown) => {
          console.warn(
            'marca: no se pudo leer la base, se usa config/:',
            e instanceof Error ? e.message : e
          );
          if (mia === generacion) {
            valor = null;
            vence = ahora() + TTL_FALLO_MS;
          }
          return null;
        })
        .finally(() => {
          if (pendiente === propia) pendiente = null;
        });
      pendiente = propia;
      return propia;
    },
    invalidar() {
      generacion += 1;
      vence = -1;
      pendiente = null;
    },
  };
}

const cachePorProceso = crearCacheFila({
  leer: () => leerFilaMarca(clienteMarca()),
});

/** Fila de la base cacheada 60 s por proceso; null si no hay o está caída. */
export function filaMarcaCacheada(): Promise<FilaMarca | null> {
  return cachePorProceso.obtener();
}

/** Para MRC.2: lo guardado se ve al instante en quien lo guardó. */
export function invalidarCacheMarca(): void {
  cachePorProceso.invalidar();
}

/** Descarga un archivo del bucket; null en cualquier error. */
export async function descargarArchivoBase(
  ruta: string,
  cliente?: SupabaseClient
): Promise<Uint8Array | null> {
  try {
    const { data, error } = await (cliente ?? clienteMarca()).storage
      .from(BUCKET_MARCA)
      .download(ruta);
    if (error || !data) return null;
    return new Uint8Array(await data.arrayBuffer());
  } catch {
    return null;
  }
}
