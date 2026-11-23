import { permiteEditarMarca, type RolMarca } from '@contracts/marca/api';
import type { AccountRole } from '@/lib/auth/roles';
import { esSuperadmin } from '@/lib/permisos/marca-superadmin';
import { createClient } from '@/lib/supabase/server';

/**
 * Quién edita la marca (R5): el owner de la empresa y el superadmin. Un
 * perfil de acceso no entra aquí: no se leen permisos efectivos.
 */

export type SesionMarca = { userId: string; rol: RolMarca };
export type LeerSesionMarca = () => Promise<SesionMarca | null>;

export function rolMarca(q: {
  user: { app_metadata?: Record<string, unknown> };
  perfil: { account_id: string; account_role: AccountRole } | null;
  empresaId?: string;
}): RolMarca {
  if (esSuperadmin(q.user)) return 'superadmin';
  const { perfil, empresaId } = q;
  if (!perfil) return 'usuario';
  if (perfil.account_role === 'owner') {
    // Falla cerrado: sin EMPRESA_ACCOUNT_ID válido solo edita el superadmin.
    return empresaId && perfil.account_id === empresaId ? 'owner' : 'usuario';
  }
  if (perfil.account_role === 'admin') return 'admin';
  return 'usuario';
}

export { permiteEditarMarca };

/** Sesión real: usuario de Supabase y su perfil. `null` sin sesión. */
export const leerSesionMarca: LeerSesionMarca = async () => {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data } = await supabase
    .from('profiles')
    .select('account_id, account_role')
    .eq('user_id', user.id)
    .maybeSingle();
  const bruto = process.env['EMPRESA_ACCOUNT_ID']?.trim();
  const empresaId =
    bruto &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      bruto
    )
      ? bruto
      : undefined;
  const perfil =
    data?.account_id && data.account_role
      ? {
          account_id: data.account_id as string,
          account_role: data.account_role as AccountRole,
        }
      : null;
  return { userId: user.id, rol: rolMarca({ user, perfil, empresaId }) };
};
