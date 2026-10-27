// Menú por perfil (SRV.2): lo que ve cada perfil contra el stub de I2
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  IDS_STUB,
  stubObtenerPermisos,
  stubPermisos,
} from '@contracts/usr/effective-permissions.stub';
import { CUENTA_STUB, stubFuenteSecciones } from '@contracts/emp/company-sections.stub';
import { usarFuenteSecciones } from './fuente';
import { visibleConversations } from '@/modulos/visibilidad/visibilidad';
import { rolDeCuenta } from '@/lib/permisos/roles';
import { NAV_ITEMS, BOTTOM_NAV_ITEMS } from '@/components/layout/sidebar';
import { filtrarMenu, cargarSeccionesDelMenu } from './menu';
import { usarObtenerPermisos } from './permisos';

let usuario: string = IDS_STUB.contestador;
let appMetadata: Record<string, unknown> = {};
vi.mock('@/lib/auth/account', () => ({
  getCurrentAccount: async () => ({
    accountId: IDS_STUB.cuenta,
    userId: usuario,
    supabase: {
      auth: {
        getUser: async () => ({ data: { user: { app_metadata: appMetadata } } }),
      },
    },
  }),
}));

const todo = [...NAV_ITEMS, ...BOTTOM_NAV_ITEMS];
const hrefs = async () =>
  filtrarMenu(todo, await cargarSeccionesDelMenu()).map((i) => i.href);

beforeEach(() => {
  usuario = IDS_STUB.contestador;
  appMetadata = {};
  usarObtenerPermisos(
    stubObtenerPermisos([
      stubPermisos({ rol: 'usuario', perfil: 'contestador' }),
      stubPermisos({ rol: 'usuario', perfil: 'marketing' }),
      stubPermisos({ rol: 'usuario' }),
    ])
  );
});
afterEach(() => {
  usarObtenerPermisos(null);
  usarFuenteSecciones(null);
});

describe('menú según el perfil', () => {
  it('Contestador: el menú solo tiene Bandeja de entrada y Notificaciones', async () => {
    expect(await hrefs()).toEqual(['/inbox', '/notifications']);
  });

  it('Contestador con modulo-visibilidad prendido ve solo sus chats', () => {
    expect(rolDeCuenta('agent')).toBe('usuario');
    const v = visibleConversations({
      userId: IDS_STUB.contestador,
      rol: 'agent',
      moduloActivo: true,
    });
    expect(
      v.puedeVer({ id: 'c1', assigned_agent_id: IDS_STUB.contestador })
    ).toBe(true);
    expect(v.puedeVer({ id: 'c2', assigned_agent_id: IDS_STUB.asesor })).toBe(
      false
    );
  });

  it('Marketing: todo lo contratado menos Configuración', async () => {
    usuario = IDS_STUB.marketing;
    const h = await hrefs();
    expect(h).toEqual(NAV_ITEMS.map((i) => i.href));
    expect(h).not.toContain('/settings');
  });

  it('Marketing con Agentes de IA apagada tampoco la ve', async () => {
    usuario = IDS_STUB.marketing;
    usarObtenerPermisos(
      stubObtenerPermisos([
        stubPermisos({
          rol: 'usuario',
          perfil: 'marketing',
          contratadas: ['inbox', 'contacts', 'notifications'],
        }),
      ])
    );
    expect(await hrefs()).not.toContain('/agents');
  });

  it('sin perfil: ninguna sección de trabajo', async () => {
    usuario = IDS_STUB.sinPerfil;
    expect(await cargarSeccionesDelMenu()).toEqual([]);
    expect(await hrefs()).toEqual([]);
  });

  it('I2 null o que lanza: menú vacío', async () => {
    usuario = 'desconocido';
    expect(await cargarSeccionesDelMenu()).toEqual([]);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    usarObtenerPermisos(async () => {
      throw new Error('x');
    });
    expect(await cargarSeccionesDelMenu()).toEqual([]);
    err.mockRestore();
  });

  it('superadmin usa lo contratado, no I2', async () => {
    appMetadata = { wacrm_superadmin: true };
    const f = stubFuenteSecciones();
    usarFuenteSecciones({
      catalogo: f.catalogo,
      contratadas: async (c) => ({
        ...(await f.contratadas(CUENTA_STUB)),
        cuentaId: c,
      }),
    });
    usarObtenerPermisos(async () => {
      throw new Error('no debe consultarse');
    });
    expect((await cargarSeccionesDelMenu()).length).toBeGreaterThan(0);
  });
});
