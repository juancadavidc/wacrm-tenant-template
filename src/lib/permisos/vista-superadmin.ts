/**
 * Vista del superadmin (EMP.2): lee con I1 el estado de las secciones de la
 * empresa y lo cambia en la tabla de EMP.1. Sin caché (R3).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CATALOGO_V1,
  IDS_SECCION,
  type SeccionId,
} from '@contracts/emp/company-sections';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import { crearFuenteSecciones, leerContratadasSupabase } from './secciones';
import { esSuperadmin } from './superadmin';

export type FilaVista = {
  id: SeccionId;
  nombre: string;
  ruta: string;
  prendida: boolean;
};

export type Vista = {
  cuenta: { id: string; nombre: string };
  secciones: FilaVista[];
};

export class CuentaEmpresaError extends Error {
  constructor(readonly encontradas: number) {
    super(
      `la instalación tiene ${encontradas} cuentas de empresa; se espera una`
    );
    this.name = 'CuentaEmpresaError';
  }
}

/** La única cuenta de la instalación cuyo owner no es superadmin. */
export async function cuentaDeEmpresa(
  admin: SupabaseClient
): Promise<{ id: string; nombre: string }> {
  const { data, error } = await admin
    .from('accounts')
    .select('id, name, owner_user_id');
  if (error) {
    throw new Error(`no se pudieron leer las cuentas: ${error.message}`);
  }
  const empresa: { id: string; nombre: string }[] = [];
  for (const c of (data ?? []) as {
    id: string;
    name: string;
    owner_user_id: string;
  }[]) {
    const { data: u, error: errU } = await admin.auth.admin.getUserById(
      c.owner_user_id
    );
    if (errU) {
      throw new Error(`no se pudo leer el owner de la cuenta: ${errU.message}`);
    }
    if (!esSuperadmin(u?.user)) empresa.push({ id: c.id, nombre: c.name });
  }
  if (empresa.length !== 1) throw new CuentaEmpresaError(empresa.length);
  return empresa[0];
}

export function esSeccionId(v: string): v is SeccionId {
  return (IDS_SECCION as readonly string[]).includes(v);
}

export async function leerVista(admin?: SupabaseClient): Promise<Vista> {
  const cliente = admin ?? supabaseAdmin();
  const cuenta = await cuentaDeEmpresa(cliente);
  const fuente = crearFuenteSecciones(leerContratadasSupabase(cliente));
  const { secciones } = await fuente.contratadas(cuenta.id);
  return {
    cuenta,
    secciones: CATALOGO_V1.map((s) => ({
      id: s.id,
      nombre: s.nombre,
      ruta: s.ruta,
      prendida: secciones.includes(s.id),
    })),
  };
}

/** Prender o apagar es un upsert del campo `prendida`, nunca un delete. */
export async function cambiarSeccion(
  admin: SupabaseClient,
  cuentaId: string,
  id: SeccionId,
  prendida: boolean
): Promise<void> {
  const { error } = await admin
    .from('permisos_secciones_cuenta')
    .upsert(
      { account_id: cuentaId, seccion_id: id, prendida },
      { onConflict: 'account_id,seccion_id' }
    );
  if (error) throw new Error(`no se pudo cambiar la sección: ${error.message}`);
}
