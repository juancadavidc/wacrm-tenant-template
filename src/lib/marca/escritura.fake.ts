import { crearLeerMarca } from './marca';
import type { FilaMarca } from './base';
import type { DepsEscritura } from './escritura';

/**
 * Fila y storage en memoria para pruebas de la ruta, la verificación del
 * publicador de I1 y la CDC de PNL.1 contra la API real. Sin caché: lo que se
 * guarda se lee al instante; `invalidar` solo se cuenta.
 */
export function crearMarcaFalsa(
  o: {
    fila?: Partial<FilaMarca> | null;
    dirConfig?: string;
    fallarUpsert?: boolean;
  } = {}
) {
  let fila: FilaMarca | null = o.fila
    ? {
        nombre: null,
        color: null,
        logo_ruta: null,
        icono_ruta: null,
        actualizado_en: '2026-11-23T00:00:00Z',
        actualizado_por: null,
        ...o.fila,
      }
    : null;
  const archivos = new Map<string, Uint8Array>();
  let invalidaciones = 0;

  const deps: DepsEscritura = {
    leerFila: async () => (fila ? { ...fila } : null),
    async guardarFila(cambios, userId) {
      if (o.fallarUpsert) throw new Error('upsert falló');
      fila = {
        nombre: null,
        color: null,
        logo_ruta: null,
        icono_ruta: null,
        ...fila,
        ...cambios,
        actualizado_en: new Date().toISOString(),
        actualizado_por: userId,
      };
    },
    async subir(ruta, bytes) {
      archivos.set(ruta, bytes);
    },
    async borrar(rutas) {
      for (const r of rutas) archivos.delete(r);
    },
    invalidar() {
      invalidaciones += 1;
    },
    leerMarca: crearLeerMarca({
      fila: async () => (fila ? { ...fila } : null),
      dir: () => o.dirConfig ?? '/no-existe-config',
    }),
  };

  return {
    deps,
    fila: () => (fila ? { ...fila } : null),
    archivos: () => archivos,
    invalidaciones: () => invalidaciones,
  };
}
