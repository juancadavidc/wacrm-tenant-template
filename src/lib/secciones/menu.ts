import type { SeccionId } from '@contracts/emp/company-sections';
import { getCurrentAccount } from '@/lib/auth/account';
import { fuenteSecciones } from './fuente';

// La parte pura vive en filtrar-menu.ts para que el cliente (sidebar) no
// arrastre código de servidor.
export { filtrarMenu } from './filtrar-menu';

/** Secciones que el menú puede pintar. No mira el rol (owner incluido). */
export async function cargarSeccionesDelMenu(): Promise<SeccionId[]> {
  try {
    const { accountId } = await getCurrentAccount();
    const { secciones } = await fuenteSecciones().contratadas(accountId);
    return [...secciones];
  } catch (err) {
    console.error('[secciones] no se pudo cargar el menú', err);
    return [];
  }
}
