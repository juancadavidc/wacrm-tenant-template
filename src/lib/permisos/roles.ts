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
 * Rol de base para una invitación. `usuario` se guarda como `agent`; `agent` y
 * `viewer` se siguen aceptando como puente hasta USR.2. `owner` no se invita.
 */
export function rolDeInvitacion(
  valor: unknown
): Exclude<AccountRole, 'owner'> | null {
  if (valor === 'usuario') return 'agent';
  if (valor === 'admin' || valor === 'agent' || valor === 'viewer') {
    return valor;
  }
  return null;
}
