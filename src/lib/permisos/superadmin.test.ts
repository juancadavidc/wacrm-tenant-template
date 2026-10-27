import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser } }),
}));

const { esSuperadmin, requireSuperadmin } = await import('./superadmin');

beforeEach(() => getUser.mockReset());

describe('esSuperadmin', () => {
  it('app_metadata.wacrm_superadmin === true es superadmin', () => {
    expect(esSuperadmin({ app_metadata: { wacrm_superadmin: true } })).toBe(
      true
    );
  });

  it('user_metadata no da superadmin', () => {
    expect(
      esSuperadmin({
        app_metadata: {},
        user_metadata: { wacrm_superadmin: true },
      } as never)
    ).toBe(false);
  });

  it('valores parecidos no cuentan', () => {
    for (const v of ['true', 1, undefined, null]) {
      expect(esSuperadmin({ app_metadata: { wacrm_superadmin: v } })).toBe(
        false
      );
    }
    expect(esSuperadmin(null)).toBe(false);
  });
});

describe('requireSuperadmin', () => {
  it('sin sesión lanza UnauthorizedError', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(requireSuperadmin()).rejects.toMatchObject({ status: 401 });
    getUser.mockResolvedValue({ data: { user: null }, error: new Error('x') });
    await expect(requireSuperadmin()).rejects.toMatchObject({ status: 401 });
  });

  it('con usuario normal lanza ForbiddenError', async () => {
    getUser.mockResolvedValue({
      data: { user: { id: 'u', app_metadata: {} } },
      error: null,
    });
    await expect(requireSuperadmin()).rejects.toMatchObject({ status: 403 });
  });

  it('lee el usuario en cada llamada', async () => {
    getUser.mockResolvedValueOnce({
      data: { user: { id: 'u', app_metadata: { wacrm_superadmin: true } } },
      error: null,
    });
    await expect(requireSuperadmin()).resolves.toEqual({ userId: 'u' });
    getUser.mockResolvedValueOnce({
      data: { user: { id: 'u', app_metadata: {} } },
      error: null,
    });
    await expect(requireSuperadmin()).rejects.toMatchObject({ status: 403 });
    expect(getUser).toHaveBeenCalledTimes(2);
  });
});
