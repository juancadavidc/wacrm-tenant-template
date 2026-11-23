import { describe, expect, it } from 'vitest';
import { permiteEditarMarca } from '@contracts/marca/api';
import { rolMarca } from './editor';

const EMP = 'empresa-1';
const sinMeta = { app_metadata: {} };
const perfil = (
  account_role: 'owner' | 'admin' | 'agent' | 'viewer',
  id = EMP
) => ({
  account_id: id,
  account_role,
});

describe('rolMarca', () => {
  it('superadmin sin perfil', () => {
    const user = { app_metadata: { wacrm_superadmin: true } };
    expect(rolMarca({ user, perfil: null, empresaId: EMP })).toBe('superadmin');
  });

  it('owner de la empresa', () => {
    expect(
      rolMarca({ user: sinMeta, perfil: perfil('owner'), empresaId: EMP })
    ).toBe('owner');
  });

  it('owner de otra cuenta con empresaId definido no edita', () => {
    expect(
      rolMarca({
        user: sinMeta,
        perfil: perfil('owner', 'otra'),
        empresaId: EMP,
      })
    ).toBe('usuario');
  });

  it('owner sin empresaId no edita (falla cerrado)', () => {
    expect(rolMarca({ user: sinMeta, perfil: perfil('owner', 'x') })).toBe(
      'usuario'
    );
  });

  it('admin, agent, viewer y sin perfil', () => {
    const r = (p: ReturnType<typeof perfil> | null) =>
      rolMarca({ user: sinMeta, perfil: p, empresaId: EMP });
    expect(r(perfil('admin'))).toBe('admin');
    expect(r(perfil('agent'))).toBe('usuario');
    expect(r(perfil('viewer'))).toBe('usuario');
    expect(r(null)).toBe('usuario');
  });

  it('user_metadata.wacrm_superadmin no cuenta', () => {
    const user = { user_metadata: { wacrm_superadmin: true } } as never;
    expect(rolMarca({ user, perfil: null })).toBe('usuario');
  });

  it('solo owner y superadmin pueden editar', () => {
    const r = (p: ReturnType<typeof perfil>) =>
      permiteEditarMarca(
        rolMarca({ user: sinMeta, perfil: p, empresaId: EMP })
      );
    expect(r(perfil('admin'))).toBe(false);
    expect(r(perfil('agent'))).toBe(false);
    expect(r(perfil('owner'))).toBe(true);
  });
});
