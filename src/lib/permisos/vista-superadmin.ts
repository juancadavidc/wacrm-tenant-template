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
  constructor(motivo: string) {
    super(motivo);
    this.name = 'CuentaEmpresaError';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * La cuenta de la empresa es la que nombra `EMPRESA_ACCOUNT_ID` en el entorno
 * de la instalación (la escribe el script de alta de empresa). No se deduce de
 * las cuentas existentes: `remove_account_member` crea cuentas personales al
 * sacar miembros. Sin el dato, o si no existe, falla cerrado.
 */
export async function cuentaDeEmpresa(
  admin: SupabaseClient,
  env: Record<string, string | undefined> = process.env
): Promise<{ id: string; nombre: string }> {
  const id = env['EMPRESA_ACCOUNT_ID']?.trim();
  if (!id || !UUID.test(id)) {
    throw new CuentaEmpresaError(
      'falta EMPRESA_ACCOUNT_ID (uuid de la cuenta de la empresa) en la configuración de la instalación'
    );
  }
  const { data, error } = await admin
    .from('accounts')
    .select('id, name')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    throw new Error(`no se pudo leer la cuenta de la empresa: ${error.message}`);
  }
  if (!data) {
    throw new CuentaEmpresaError(
      'EMPRESA_ACCOUNT_ID no corresponde a ninguna cuenta de esta base'
    );
  }
  const c = data as { id: string; name: string };
  return { id: c.id, nombre: c.name };
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
