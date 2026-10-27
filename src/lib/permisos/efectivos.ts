/**
 * Implementación de I2 (PRD wacrm-permisos-granulares): permiso efectivo de un
 * usuario en una cuenta. Lee en cada llamada, sin caché; ante un error falla
 * cerrado (lanza, nunca devuelve "todo contratado").
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FuenteSecciones } from '@contracts/emp/company-sections';
import {
  PermisosEfectivosSchema,
  recortarSecciones,
  type ObtenerPermisosEfectivos,
} from '@contracts/usr/effective-permissions';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import type { AccountRole } from '@/lib/auth/roles';
import { rolDeCuenta } from './roles';

export type Miembro = {
  rolCuenta: AccountRole;
  perfil: { id: string; nombre: string; secciones: string[] } | null;
};

export type LeerMiembro = (q: {
  cuentaId: string;
  usuarioId: string;
}) => Promise<Miembro | null>;

/** Perfiles de fábrica (R15); la migración los siembra con estas mismas listas. */
export const PERFILES_FABRICA: readonly {
  nombre: string;
  secciones: readonly string[];
}[] = [
  { nombre: 'Asesor', secciones: ['inbox', 'contacts', 'pipelines'] },
  { nombre: 'Contestador', secciones: ['inbox', 'notifications'] },
  {
    nombre: 'Marketing',
    secciones: [
      'dashboard',
      'inbox',
      'notifications',
      'contacts',
      'pipelines',
      'broadcasts',
      'automations',
      'flows',
      'agents',
    ],
  },
  {
    nombre: 'Asesor con Agentes IA',
    secciones: ['inbox', 'contacts', 'pipelines', 'agents'],
  },
];

type FilaMiembro = {
  account_role: AccountRole;
  perfil_id: string | null;
  perfil_nombre: string | null;
  perfil_secciones: string[] | null;
};

/** Lector por RPC. El cliente se resuelve en la primera llamada. */
export function leerMiembroSupabase(cliente?: SupabaseClient): LeerMiembro {
  return async ({ cuentaId, usuarioId }) => {
    const { data, error } = await (cliente ?? supabaseAdmin()).rpc(
      'permisos_miembro',
      { p_account_id: cuentaId, p_user_id: usuarioId }
    );
    if (error) {
      throw new Error(`no se pudo leer el miembro: ${error.message}`);
    }
    const fila = ((data as FilaMiembro[] | null) ?? [])[0];
    if (!fila) return null;
    return {
      rolCuenta: fila.account_role,
      perfil: fila.perfil_id
        ? {
            id: fila.perfil_id,
            nombre: fila.perfil_nombre ?? '',
            secciones: fila.perfil_secciones ?? [],
          }
        : null,
    };
  };
}

export function crearObtenerPermisosEfectivos(d: {
  fuente: FuenteSecciones;
  leer?: LeerMiembro;
}): ObtenerPermisosEfectivos {
  const leer = d.leer ?? leerMiembroSupabase();
  return async ({ cuentaId, usuarioId }) => {
    const miembro = await leer({ cuentaId, usuarioId });
    if (!miembro) return null;
    const rol = rolDeCuenta(miembro.rolCuenta);
    const { secciones: contratadas } = await d.fuente.contratadas(cuentaId);
    const perfil = rol === 'usuario' ? miembro.perfil : null;
    return PermisosEfectivosSchema.parse({
      cuentaId,
      usuarioId,
      rol,
      perfil: perfil ? { id: perfil.id, nombre: perfil.nombre } : null,
      secciones: recortarSecciones({
        rol,
        seccionesPerfil: perfil ? perfil.secciones : null,
        contratadas,
      }),
    });
  };
}
