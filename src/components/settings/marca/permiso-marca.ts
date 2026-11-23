import { permiteEditarMarca, type RolMarca } from '@contracts/marca/api';
import { esSuperadmin } from '@/lib/permisos/marca-superadmin';
import type { AccountRole } from '@/lib/auth/roles';

type Entrada = {
  accountRole: AccountRole | null;
  user: {
    app_metadata?: Record<string, unknown>;
    user_metadata?: Record<string, unknown>;
  } | null;
};

/** Rol de marca (R5): superadmin, owner, admin o cualquier otro (usuario). */
export function rolMarca(a: Entrada): RolMarca {
  if (esSuperadmin(a.user)) return 'superadmin';
  if (a.accountRole === 'owner') return 'owner';
  if (a.accountRole === 'admin') return 'admin';
  return 'usuario';
}

export function puedeEditarMarca(a: Entrada): boolean {
  return permiteEditarMarca(rolMarca(a));
}

/**
 * Mientras carga el perfil, quien pide `?tab=brand` no ve nada: el rol aún no
 * se conoce y caer a Resumen un instante confundiría al owner.
 */
export function esperarPerfilParaMarca(a: {
  tab: string | null | undefined;
  profileLoading: boolean;
}): boolean {
  return a.tab === 'brand' && a.profileLoading;
}
