import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const requireRole = vi.fn();
const listar = vi.fn();

vi.mock('@/lib/auth/account', async () => {
  const real =
    await vi.importActual<typeof import('@/lib/auth/account')>(
      '@/lib/auth/account'
    );
  return { ...real, requireRole };
});
vi.mock('./perfiles', async () => {
  const real = await vi.importActual<typeof import('./perfiles')>('./perfiles');
  return { ...real, listarPerfiles: listar };
});

const { GET, POST } = await import('@/app/api/account/members/profiles/route');
const { PATCH } = await import('@/app/api/account/members/profiles/[id]/route');
const { PUT } =
  await import('@/app/api/account/members/[userId]/profile/route');
const { POST: INVITAR } = await import('@/app/api/account/invitations/route');
const { ForbiddenError } = await import('@/lib/auth/account');

const UUID = '00000000-0000-4000-8000-0000000000a1';
let n = 0;
const peticion = (metodo: string, cuerpo?: unknown) =>
  new Request('https://app.test/x', {
    method: metodo,
    headers: { 'x-forwarded-for': `10.1.0.${++n}` },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });

beforeEach(() => {
  rpc.mockReset();
  listar.mockReset();
  requireRole.mockReset().mockResolvedValue({
    supabase: { rpc, from: vi.fn() },
    userId: `u-${Math.random()}`,
    accountId: 'c1',
    role: 'admin',
  });
});

describe('rutas de perfiles', () => {
  it('POST con una sección inventada responde 400 y no llama la RPC', async () => {
    const res = await POST(
      peticion('POST', { nombre: 'X', secciones: ['reportes'] })
    );
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('POST válido llama permisos_guardar_perfil con p_perfil_id null y responde 201', async () => {
    rpc.mockResolvedValue({ data: UUID, error: null });
    const res = await POST(
      peticion('POST', { nombre: 'Ventas', secciones: ['inbox'] })
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: UUID });
    expect(rpc).toHaveBeenCalledWith('permisos_guardar_perfil', {
      p_perfil_id: null,
      p_nombre: 'Ventas',
      p_secciones: ['inbox'],
    });
  });

  it('PATCH pasa el id de la ruta', async () => {
    rpc.mockResolvedValue({ data: UUID, error: null });
    const res = await PATCH(
      peticion('PATCH', { nombre: 'Asesor', secciones: ['inbox', 'agents'] }),
      { params: Promise.resolve({ id: UUID }) }
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      'permisos_guardar_perfil',
      expect.objectContaining({ p_perfil_id: UUID })
    );
  });

  it('nombre repetido (23505) responde 409', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'duplicate key' },
    });
    const res = await POST(
      peticion('POST', { nombre: 'Asesor', secciones: [] })
    );
    expect(res.status).toBe(409);
  });

  it('PUT con perfilId null quita el perfil', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const res = await PUT(peticion('PUT', { perfilId: null }), {
      params: Promise.resolve({ userId: UUID }),
    });
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('permisos_asignar_perfil', {
      p_user_id: UUID,
      p_perfil_id: null,
    });
  });

  it('PUT sobre uno mismo (42501 de la RPC) responde 403', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'Nadie cambia su propio perfil' },
    });
    const res = await PUT(peticion('PUT', { perfilId: UUID }), {
      params: Promise.resolve({ userId: UUID }),
    });
    expect(res.status).toBe(403);
  });

  it('GET devuelve los perfiles con su conteo', async () => {
    const perfiles = [
      {
        id: UUID,
        nombre: 'Asesor',
        secciones: ['inbox'],
        deFabrica: true,
        usuarios: 2,
      },
    ];
    listar.mockResolvedValue(perfiles);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ perfiles });
  });

  it('requireRole que lanza Forbidden → 403 sin tocar la RPC', async () => {
    requireRole.mockRejectedValue(new ForbiddenError('no'));
    const a = await POST(peticion('POST', { nombre: 'X', secciones: [] }));
    const b = await PUT(peticion('PUT', { perfilId: null }), {
      params: Promise.resolve({ userId: UUID }),
    });
    expect([a.status, b.status]).toEqual([403, 403]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('invitar como admin siendo admin: el 42501 del insert responde 403', async () => {
    const insert = {
      insert: () => insert,
      select: () => insert,
      single: async () => ({
        data: null,
        error: { code: '42501', message: 'Solo el owner nombra admins' },
      }),
    };
    requireRole.mockResolvedValue({
      supabase: { from: () => insert },
      userId: 'u-admin',
      accountId: 'c1',
      role: 'admin',
    });
    const res = await INVITAR(peticion('POST', { role: 'admin' }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/owner/);
  });

  it('ninguna ruta nueva recibe un rol', () => {
    const base = join(process.cwd(), 'src/app/api/account/members');
    for (const f of [
      'profiles/route.ts',
      'profiles/[id]/route.ts',
      '[userId]/profile/route.ts',
    ]) {
      const texto = readFileSync(join(base, f), 'utf8');
      expect(texto).not.toContain('isAccountRole(');
      expect(texto).not.toContain('set_member_role');
    }
  });
});
