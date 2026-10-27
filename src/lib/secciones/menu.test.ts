import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { IDS_SECCION } from '@contracts/emp/company-sections';
import {
  CUENTA_STUB,
  stubFuenteSecciones,
  type FuenteSeccionesStub,
} from '@contracts/emp/company-sections.stub';
import { usarFuenteSecciones } from './fuente';
import { filtrarMenu, cargarSeccionesDelMenu } from './menu';
import { NAV_ITEMS, BOTTOM_NAV_ITEMS } from '@/components/layout/sidebar';

const getCurrentAccount = vi.fn();
vi.mock('@/lib/auth/account', () => ({
  getCurrentAccount: () => getCurrentAccount(),
}));

let s: FuenteSeccionesStub;
beforeEach(() => {
  s = stubFuenteSecciones();
  usarFuenteSecciones(s);
});
afterEach(() => {
  usarFuenteSecciones(null);
  getCurrentAccount.mockReset();
});

describe('menú por secciones contratadas', () => {
  it('filtrarMenu quita Agentes de IA del menú real', () => {
    const todo = [...NAV_ITEMS, ...BOTTOM_NAV_ITEMS];
    const sin = IDS_SECCION.filter((id) => id !== 'agents');
    const hrefs = filtrarMenu(todo, sin).map((i) => i.href);
    expect(hrefs).not.toContain('/agents');
    expect(hrefs).toHaveLength(9);
    expect(filtrarMenu(todo, IDS_SECCION)).toHaveLength(10);
  });

  it.each(['owner', 'admin', 'agent', 'viewer'])(
    'con Agentes de IA apagada, %s no la ve en el menú',
    async (role) => {
      getCurrentAccount.mockResolvedValue({ accountId: CUENTA_STUB, role });
      s.apagar('agents');
      expect(await cargarSeccionesDelMenu()).not.toContain('agents');
    }
  );

  it('sin cuenta, el menú queda vacío', async () => {
    getCurrentAccount.mockRejectedValue(new Error('sin sesión'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await cargarSeccionesDelMenu()).toEqual([]);
  });

  it('un ítem sin sección del catálogo no se pinta', () => {
    expect(filtrarMenu([{ href: '/raro' }], IDS_SECCION)).toEqual([]);
  });
});
