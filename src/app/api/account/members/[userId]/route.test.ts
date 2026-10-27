import { describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();

vi.mock('@/lib/auth/account', async (original) => ({
  ...(await original<typeof import('@/lib/auth/account')>()),
  requireRole: async () => ({
    userId: 'u-owner',
    accountId: 'a1',
    role: 'owner',
    supabase: { rpc },
  }),
}));

const { PATCH } = await import('./route');

let n = 0;
function call(body: unknown) {
  return PATCH(
    new Request('https://app.test/api/account/members/u2', {
      method: 'PATCH',
      headers: { 'x-forwarded-for': `10.2.0.${++n}` },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ userId: 'u2' }) }
  );
}

describe('PATCH /api/account/members/[userId] (R19)', () => {
  it('con role superadmin responde 400 y no llama set_member_role', async () => {
    const res = await call({ role: 'superadmin' });
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('control: role admin llama set_member_role', async () => {
    rpc.mockResolvedValue({ error: null });
    const res = await call({ role: 'admin' });
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('set_member_role', {
      p_user_id: 'u2',
      p_new_role: 'admin',
    });
  });
});
