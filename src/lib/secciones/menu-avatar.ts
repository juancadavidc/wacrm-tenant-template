import type { SeccionId } from '@contracts/emp/company-sections';

/**
 * Enlaces del menú del avatar según las secciones que el usuario puede usar
 * (la misma lista que pinta el sidebar). "Perfil" cae a /cuenta sin acceso a
 * Configuración; "Configuración" solo aparece con acceso.
 */
export function enlacesMenuAvatar(secciones: readonly SeccionId[]): {
  perfil: string;
  configuracion: string | null;
} {
  const conSettings = secciones.includes('settings');
  return {
    perfil: conSettings ? '/settings?tab=profile' : '/cuenta',
    configuracion: conSettings ? '/settings?tab=whatsapp' : null,
  };
}
