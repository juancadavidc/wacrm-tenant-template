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
