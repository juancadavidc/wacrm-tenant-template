/**
 * Implementación de I1 (PRD wacrm-permisos-granulares): lee de la base qué
 * secciones tiene prendidas cada empresa, en cada llamada y sin caché (R3).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CATALOGO_V1,
  IDS_SECCION,
  SeccionesContratadasSchema,
  type FuenteSecciones,
} from '@contracts/emp/company-sections';
import { supabaseAdmin } from '@/lib/automations/admin-client';

export type LeerContratadas = (cuentaId: string) => Promise<readonly string[]>;

/** Lector por RPC. El cliente se resuelve en la primera llamada, no al importar. */
export function leerContratadasSupabase(
  cliente?: SupabaseClient
): LeerContratadas {
  return async (cuentaId) => {
    const { data, error } = await (cliente ?? supabaseAdmin()).rpc(
      'permisos_secciones_contratadas',
      { p_account_id: cuentaId }
    );
    if (error) {
      throw new Error(
        `no se pudieron leer las secciones contratadas: ${error.message}`
      );
    }
    return (data as string[] | null) ?? [];
  };
}

export function crearFuenteSecciones(
  leer: LeerContratadas = leerContratadasSupabase()
): FuenteSecciones {
  return {
    async catalogo() {
      return CATALOGO_V1;
    },
    async contratadas(cuentaId) {
      const ids = await leer(cuentaId);
      // Ids que el código no conoce se descartan: dar acceso a algo que no
      // sabe proteger sería el error inseguro.
      const secciones = IDS_SECCION.filter((id) => ids.includes(id));
      return SeccionesContratadasSchema.parse({ cuentaId, secciones });
    },
  };
}
