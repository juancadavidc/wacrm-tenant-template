import {
  CATALOGO_V1,
  IDS_SECCION,
  type FuenteSecciones,
} from '@contracts/emp/company-sections';

/**
 * Fuente provisional: toda cuenta tiene todas las secciones (R20).
 * EMP.1 reemplaza FUENTE_TODO_CONTRATADO por la fuente real (sin caché, R3).
 */
export const FUENTE_TODO_CONTRATADO: FuenteSecciones = {
  async catalogo() {
    return CATALOGO_V1;
  },
  async contratadas(cuentaId) {
    return { cuentaId, secciones: [...IDS_SECCION] };
  },
};

let registrada: FuenteSecciones | null = null;

/** La fuente vigente: la registrada o, por ahora, todo contratado. */
export function fuenteSecciones(): FuenteSecciones {
  return registrada ?? FUENTE_TODO_CONTRATADO;
}

/** Solo pruebas: registra una fuente; `null` restaura la de por defecto. */
export function usarFuenteSecciones(f: FuenteSecciones | null): void {
  registrada = f;
}
