/**
 * Traducción entre el rol de la base (`owner|admin|agent|viewer`) y el rol de
 * I2 (`owner|admin|usuario`). El enum de la base no cambia (decisión 1 del plan).
 */
import type { Rol } from '@contracts/usr/effective-permissions';
import type { AccountRole } from '@/lib/auth/roles';

export function rolDeCuenta(rol: AccountRole): Rol {
  if (rol === 'owner' || rol === 'admin') return rol;
  return 'usuario';
}

/**
 * Rol de base para una invitación o un cambio de rol. Solo `usuario → agent` y
 * `admin → admin` (decisión 9 de USR.2): `agent`, `viewer`, `owner` y
 * cualquier otro valor (superadmin incluido, R19) → `null`.
 */
export function rolDeInvitacion(valor: unknown): 'agent' | 'admin' | null {
  if (valor === 'usuario') return 'agent';
  if (valor === 'admin') return 'admin';
  return null;
}
