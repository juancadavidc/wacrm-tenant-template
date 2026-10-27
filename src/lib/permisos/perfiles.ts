/**
 * Entradas, errores y lectura de los perfiles para las rutas de USR.2 (PRD
 * wacrm-permisos-granulares). Las escrituras viven en las RPC de
 * permisos_003_gestion_perfiles.sql.
 */
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  IDS_SECCION,
  SeccionIdSchema,
  type SeccionId,
} from '@contracts/emp/company-sections';

export const PerfilEntradaSchema = z
  .strictObject({
    nombre: z.string().trim().min(1).max(60),
    secciones: z.array(SeccionIdSchema),
  })
  .refine((p) => new Set(p.secciones).size === p.secciones.length, {
    message: 'secciones repetidas',
    path: ['secciones'],
  });
export type PerfilEntrada = z.infer<typeof PerfilEntradaSchema>;

export const AsignacionSchema = z.strictObject({
  perfilId: z.uuid().nullable(),
});

export type PerfilListado = {
  id: string;
  nombre: string;
  secciones: SeccionId[];
  deFabrica: boolean;
  usuarios: number;
};

const ids = new Set<string>(IDS_SECCION);

export async function listarPerfiles(
  supabase: SupabaseClient,
  cuentaId: string
): Promise<PerfilListado[]> {
  const { data: perfiles, error } = await supabase
    .from('permisos_perfiles')
    .select('id, nombre, secciones, de_fabrica')
    .eq('account_id', cuentaId)
    .order('de_fabrica', { ascending: false })
    .order('nombre', { ascending: true });
  if (error) throw error;
  const { data: asignados, error: errorAsignados } = await supabase
    .from('permisos_perfil_usuario')
    .select('perfil_id')
    .eq('account_id', cuentaId);
  if (errorAsignados) throw errorAsignados;

  const cuenta = new Map<string, number>();
  for (const a of (asignados ?? []) as { perfil_id: string }[]) {
    cuenta.set(a.perfil_id, (cuenta.get(a.perfil_id) ?? 0) + 1);
  }
  return (
    (perfiles ?? []) as {
      id: string;
      nombre: string;
      secciones: string[];
      de_fabrica: boolean;
    }[]
  ).map((p) => ({
    id: p.id,
    nombre: p.nombre,
    secciones: p.secciones.filter((s): s is SeccionId => ids.has(s)),
    deFabrica: p.de_fabrica,
    usuarios: cuenta.get(p.id) ?? 0,
  }));
}

export function errorRpcAEstado(
  e: Pick<PostgrestError, 'code' | 'message'>
): 400 | 403 | 404 | 409 | 500 {
  if (e.code === '42501') return 403;
  if (e.code === '22023') {
    return e.message === 'Perfil no encontrado' ? 404 : 400;
  }
  if (e.code === '23514') return 400;
  if (e.code === '23505') return 409;
  return 500;
}
