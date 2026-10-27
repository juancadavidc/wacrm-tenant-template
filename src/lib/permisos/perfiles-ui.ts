/**
 * Reglas de qué ve y qué puede tocar cada quien en la pantalla de usuarios y
 * perfiles (USR.2). Son solo la cara de la UI: el servidor las vuelve a
 * aplicar (R10, R17, R21).
 */
import { CATALOGO_V1 } from '@contracts/emp/company-sections';
import type { AccountRole } from '@/lib/auth/roles';

/** Roles que `quienMira` puede asignar al invitar o cambiar un rol. */
export function opcionesDeRol(
  quienMira: AccountRole
): ('usuario' | 'admin')[] {
  if (quienMira === 'owner') return ['usuario', 'admin'];
  if (quienMira === 'admin') return ['usuario'];
  return [];
}

/** ¿Puede `quienMira` cambiar el rol de `miembro`? (R21: al admin, solo el owner) */
export function puedeEditarRol(
  quienMira: AccountRole,
  miembro: AccountRole,
  esUnoMismo: boolean
): boolean {
  if (esUnoMismo || miembro === 'owner') return false;
  if (miembro === 'admin') return quienMira === 'owner';
  return quienMira === 'owner' || quienMira === 'admin';
}

/** ¿Puede `quienMira` asignar perfil a `miembro`? (R10 no uno mismo, R17 solo usuarios) */
export function puedeAsignarPerfil(
  quienMira: AccountRole,
  miembro: AccountRole,
  esUnoMismo: boolean
): boolean {
  if (esUnoMismo) return false;
  if (quienMira !== 'owner' && quienMira !== 'admin') return false;
  return miembro === 'agent' || miembro === 'viewer';
}

/** Nombres del catálogo, en su orden, para los ids dados (los desconocidos se ignoran). */
export function nombresDeSecciones(ids: readonly string[]): string[] {
  const set = new Set(ids);
  return CATALOGO_V1.filter((s) => set.has(s.id)).map((s) => s.nombre);
}
