import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import type { CandidatoMarca } from '@contracts/marca/marca';
import { dirConfigEmpresa } from '@/modulos/interruptores';
import { LOGO_MAX_BYTES, TIPOS_LOGO } from './tipos';

export { LOGO_MAX_BYTES, TIPOS_LOGO };
export const ICONO_MAX_BYTES = 512 * 1024;

export type ArchivoConfig = { ruta: string; tipo: string; version: string };

function leerYaml(ruta: string): Record<string, unknown> {
  try {
    const doc = yaml.load(fs.readFileSync(ruta, 'utf8'));
    return typeof doc === 'object' && doc !== null
      ? (doc as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function objeto(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null
    ? (v as Record<string, unknown>)
    : {};
}

/**
 * Archivo de marca (`marca.logo` / `marca.icono` de `marca.yaml`) dentro de
 * `config/marca/`; null si falta, sale de la carpeta, tiene un tipo no
 * aceptado o pesa de más. La versión cambia al reemplazar el archivo.
 */
export function archivoConfig(
  campo: 'logo' | 'icono',
  dir: string = dirConfigEmpresa()
): ArchivoConfig | null {
  const archivo = objeto(leerYaml(path.join(dir, 'marca.yaml')).marca)[campo];
  if (typeof archivo !== 'string' || archivo === '') return null;
  const carpeta = path.join(dir, 'marca');
  const ruta = path.resolve(carpeta, archivo);
  if (path.dirname(ruta) !== carpeta) return null;
  const tipo = TIPOS_LOGO[path.extname(ruta).toLowerCase()];
  if (!tipo) return null;
  const tope = campo === 'logo' ? LOGO_MAX_BYTES : ICONO_MAX_BYTES;
  try {
    const st = fs.statSync(ruta);
    if (!st.isFile() || st.size > tope) return null;
    const version = `${Math.trunc(st.mtimeMs).toString(36)}-${st.size.toString(36)}`;
    return { ruta, tipo, version };
  } catch {
    return null;
  }
}

/** Valores crudos de `config/`; lo ausente o ilegible simplemente no está. */
export function leerCandidatoConfig(
  dir: string = dirConfigEmpresa()
): CandidatoMarca {
  const nombre = objeto(
    leerYaml(path.join(dir, 'empresa.yaml')).empresa
  ).nombre;
  const color = objeto(leerYaml(path.join(dir, 'marca.yaml')).marca).color;
  const candidato: CandidatoMarca = {};
  if (typeof nombre === 'string') candidato.nombre = nombre;
  if (typeof color === 'string') candidato.color = color;
  const logo = archivoConfig('logo', dir);
  if (logo) candidato.logo = { version: logo.version };
  const icono = archivoConfig('icono', dir);
  if (icono) candidato.icono = { version: icono.version };
  return candidato;
}
