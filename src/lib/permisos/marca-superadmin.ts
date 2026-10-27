/**
 * Marca de superadmin (R19), pura: sin `next/headers` ni cliente de servidor,
 * para poder importarla desde el middleware. `app_metadata` solo se escribe con
 * la llave de servicio; `user_metadata` (editable por el usuario) no cuenta.
 */
export const MARCA_SUPERADMIN = 'wacrm_superadmin';

export function esSuperadmin(
  usuario: { app_metadata?: Record<string, unknown> } | null | undefined
): boolean {
  return usuario?.app_metadata?.[MARCA_SUPERADMIN] === true;
}

/** Quién ve qué en la página /superadmin: sin I/O. Vive aquí (módulo de servidor, sin 'use client') porque la página de servidor la llama. */
export function decidirPagina(
  usuario: Parameters<typeof esSuperadmin>[0]
): 'sin-acceso' | 'vista' {
  return esSuperadmin(usuario) ? 'vista' : 'sin-acceso';
}
