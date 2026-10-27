import type { FuenteSecciones } from '@contracts/emp/company-sections';
import { crearFuenteSecciones } from '@/lib/permisos/secciones';

let registrada: FuenteSecciones | null = null;
let real: FuenteSecciones | null = null;

/**
 * La fuente vigente: la real de EMP.1 (`src/lib/permisos/secciones.ts`), que
 * lee la base en cada llamada y sin caché (R3). Se crea en el primer uso, no
 * al importar.
 */
export function fuenteSecciones(): FuenteSecciones {
  if (registrada) return registrada;
  real ??= crearFuenteSecciones();
  return real;
}

/** Solo pruebas: registra una fuente; `null` restaura la de por defecto. */
export function usarFuenteSecciones(f: FuenteSecciones | null): void {
  registrada = f;
}
