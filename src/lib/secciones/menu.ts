import { CATALOGO_V1, type SeccionId } from '@contracts/emp/company-sections';
import { getCurrentAccount } from '@/lib/auth/account';
import { esSuperadmin } from '@/lib/permisos/marca-superadmin';
import { fuenteSecciones } from './fuente';
import { obtenerPermisos } from './permisos';

// La parte pura vive en filtrar-menu.ts para que el cliente (sidebar) no
// arrastre código de servidor.
export { filtrarMenu } from './filtrar-menu';

/**
 * Secciones que el menú puede pintar: las del permiso efectivo del usuario
 * (I2: perfil ∩ contratado). El superadmin queda fuera de I2 y ve lo
 * contratado de su cuenta. Ante cualquier error, ninguna.
 */
export async function cargarSeccionesDelMenu(): Promise<SeccionId[]> {
  try {
    const ctx = await getCurrentAccount();
    const {
      data: { user },
    } = await ctx.supabase.auth.getUser();
    if (esSuperadmin(user)) {
      const { secciones } = await fuenteSecciones().contratadas(ctx.accountId);
      return [...secciones];
    }
    const p = await obtenerPermisos()({
      cuentaId: ctx.accountId,
      usuarioId: ctx.userId,
    });
    if (p === null) return [];
    const ids = new Set<string>(CATALOGO_V1.map((s) => s.id));
    return p.secciones.filter((s) => ids.has(s)) as SeccionId[];
  } catch (err) {
    console.error('[secciones] no se pudo cargar el menú', err);
    return [];
  }
}
