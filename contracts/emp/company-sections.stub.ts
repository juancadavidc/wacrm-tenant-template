/**
 * Stub de I1 (PRD wacrm-permisos-granulares): fuente en memoria que se puede
 * prender y apagar. Escrito a mano sobre CATALOGO_V1; no se genera.
 */
import {
  CATALOGO_V1,
  IDS_SECCION,
  SeccionesContratadasSchema,
  type FuenteSecciones,
  type SeccionId,
  type SeccionesContratadas,
} from './company-sections';

export const CUENTA_STUB = '11111111-1111-4111-8111-111111111111';

export function stubSeccionesContratadas(
  secciones: readonly SeccionId[] = IDS_SECCION,
  cuentaId: string = CUENTA_STUB
): SeccionesContratadas {
  return SeccionesContratadasSchema.parse({
    cuentaId,
    secciones: [...secciones],
  });
}

export interface FuenteSeccionesStub extends FuenteSecciones {
  prender(id: SeccionId): void;
  apagar(id: SeccionId): void;
}

export function stubFuenteSecciones(
  inicial: readonly SeccionId[] = IDS_SECCION
): FuenteSeccionesStub {
  const estado = new Set<SeccionId>(inicial);
  return {
    async catalogo() {
      return CATALOGO_V1;
    },
    async contratadas(cuentaId) {
      const vigentes =
        cuentaId === CUENTA_STUB
          ? IDS_SECCION.filter((id) => estado.has(id))
          : [];
      return stubSeccionesContratadas(vigentes, cuentaId);
    },
    prender(id) {
      estado.add(id);
    },
    apagar(id) {
      estado.delete(id);
    },
  };
}
