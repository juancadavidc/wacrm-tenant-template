import { describe, expect, it, vi } from 'vitest';

const insert = vi.fn();
const single = vi.fn();
const supabase = {
  from: () => ({
    insert: (fila: unknown) => {
      insert(fila);
      return { select: () => ({ single }) };
    },
  }),
};

vi.mock('@/lib/auth/account', async (original) => ({
  ...(await original<typeof import('@/lib/auth/account')>()),
  requireRole: async () => ({
    userId: 'u-owner',
    accountId: 'a1',
    role: 'owner',
    supabase,
  }),
}));

const { POST } = await import('./route');

let n = 0;
function call(body: unknown) {
  return POST(
    new Request('https://app.test/api/account/invitations', {
      method: 'POST',
      headers: { 'x-forwarded-for': `10.1.0.${++n}`, host: 'app.test' },
      body: JSON.stringify(body),
    })
  );
}

describe('POST /api/account/invitations (R19)', () => {
  it('con role superadmin responde 400 y no inserta invitación', async () => {
    const res = await call({ role: 'superadmin' });
    expect(res.status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
  });

  it('control: role agent sí llega al insert', async () => {
    single.mockResolvedValue({
      data: { id: 'i1', role: 'agent' },
      error: null,
    });
    const res = await call({ role: 'agent' });
    expect(res.status).toBe(201);
    expect(insert).toHaveBeenCalledTimes(1);
  });
});
