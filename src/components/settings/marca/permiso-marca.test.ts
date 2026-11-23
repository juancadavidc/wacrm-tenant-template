import { describe, expect, it } from 'vitest';
import {
  esperarPerfilParaMarca,
  puedeEditarMarca,
  rolMarca,
} from './permiso-marca';

describe('puedeEditarMarca', () => {
  it('owner sí; admin, agent, viewer y sin rol no', () => {
    expect(puedeEditarMarca({ accountRole: 'owner', user: {} })).toBe(true);
    for (const r of ['admin', 'agent', 'viewer', null] as const)
      expect(puedeEditarMarca({ accountRole: r, user: {} })).toBe(false);
  });

  it('superadmin que en la cuenta es admin sí', () => {
    const a = {
      accountRole: 'admin' as const,
      user: { app_metadata: { wacrm_superadmin: true } },
    };
    expect(puedeEditarMarca(a)).toBe(true);
    expect(rolMarca(a)).toBe('superadmin');
  });

  it('wacrm_superadmin solo en user_metadata no cuenta', () => {
    const user = { user_metadata: { wacrm_superadmin: true } };
    expect(puedeEditarMarca({ accountRole: 'admin', user })).toBe(false);
    expect(puedeEditarMarca({ accountRole: 'owner', user })).toBe(true);
  });
});

describe('esperarPerfilParaMarca', () => {
  it('espera solo con ?tab=brand y el perfil cargando', () => {
    expect(esperarPerfilParaMarca({ tab: 'brand', profileLoading: true })).toBe(
      true
    );
    expect(
      esperarPerfilParaMarca({ tab: 'brand', profileLoading: false })
    ).toBe(false);
    expect(
      esperarPerfilParaMarca({ tab: 'members', profileLoading: true })
    ).toBe(false);
    expect(esperarPerfilParaMarca({ tab: null, profileLoading: true })).toBe(
      false
    );
  });
});
