import fs from 'node:fs';
import path from 'node:path';
import type { Metadata } from 'next';
import { armarMarca, type LeerMarca, type Marca } from '@contracts/marca/marca';
import { dirConfigEmpresa } from '@/modulos/interruptores';
import {
  archivoDeRuta,
  candidatoBase,
  descargarArchivoBase,
  filaMarcaCacheada,
  invalidarCacheMarca,
  type FilaMarca,
} from './base';
import {
  archivoConfig,
  leerCandidatoConfig,
  LOGO_MAX_BYTES,
  TIPOS_LOGO,
} from './config';

export { COLOR_DEFECTO } from '@contracts/marca/marca';
export type { Marca };
export { TIPOS_LOGO, LOGO_MAX_BYTES, leerCandidatoConfig, invalidarCacheMarca };

/** Headers literales de las rutas de archivos de marca (R10). */
export const HEADERS_ARCHIVO_MARCA = {
  'Cache-Control': 'public, max-age=300',
  // Un SVG abierto directo no debe poder ejecutar scripts.
  'Content-Security-Policy':
    "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  'X-Content-Type-Options': 'nosniff',
} as const;

/** Marca efectiva: por campo base → config/ → Stackless. Si la base falla, sin base. */
export function crearLeerMarca(deps: {
  fila: () => Promise<FilaMarca | null>;
  dir: () => string;
}): LeerMarca {
  return async () => {
    let fila: FilaMarca | null = null;
    try {
      fila = await deps.fila();
    } catch {
      fila = null;
    }
    return armarMarca({
      base: candidatoBase(fila),
      config: leerCandidatoConfig(deps.dir()),
    });
  };
}

export const leerMarca: LeerMarca = crearLeerMarca({
  fila: filaMarcaCacheada,
  dir: dirConfigEmpresa,
});

export function metadataDeMarca(
  marca: Marca
): Pick<Metadata, 'title' | 'icons'> {
  return {
    title: {
      default: marca.nombre,
      template: `%s — ${marca.nombre}`,
    },
    icons: { icon: [{ url: marca.iconoUrl }] },
  };
}

export type ArchivoMarca = { cuerpo: Uint8Array; tipo: string };

/** Archivo que sirve cada ruta: base → config/ → (solo logo) Stackless → null. */
export function crearArchivoMarca(deps: {
  fila: () => Promise<FilaMarca | null>;
  descargar: (ruta: string) => Promise<Uint8Array | null>;
  dir: () => string;
  stackless: () => Uint8Array;
}): (campo: 'logo' | 'icono') => Promise<ArchivoMarca | null> {
  return async (campo) => {
    let fila: FilaMarca | null = null;
    try {
      fila = await deps.fila();
    } catch {
      fila = null;
    }
    const enBase = archivoDeRuta(
      fila ? (campo === 'logo' ? fila.logo_ruta : fila.icono_ruta) : null
    );
    if (enBase) {
      const cuerpo = await deps.descargar(enBase.ruta);
      if (cuerpo) return { cuerpo, tipo: enBase.tipo };
    }
    const enConfig = archivoConfig(campo, deps.dir());
    if (enConfig) {
      try {
        return {
          cuerpo: new Uint8Array(fs.readFileSync(enConfig.ruta)),
          tipo: enConfig.tipo,
        };
      } catch {
        // el archivo desapareció entre el stat y la lectura
      }
    }
    if (campo === 'logo') {
      return { cuerpo: deps.stackless(), tipo: 'image/png' };
    }
    return null;
  };
}

export const archivoMarca = crearArchivoMarca({
  fila: filaMarcaCacheada,
  descargar: (ruta) => descargarArchivoBase(ruta),
  dir: dirConfigEmpresa,
  stackless: () =>
    new Uint8Array(
      fs.readFileSync(
        path.join(process.cwd(), 'public', 'stackless', 'logo.png')
      )
    ),
});

export async function responderArchivoMarca(
  campo: 'logo' | 'icono'
): Promise<Response> {
  const archivo = await archivoMarca(campo);
  if (!archivo) return new Response(null, { status: 404 });
  return new Response(archivo.cuerpo as BodyInit, {
    headers: { 'Content-Type': archivo.tipo, ...HEADERS_ARCHIVO_MARCA },
  });
}
