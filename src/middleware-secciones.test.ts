import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  CUENTA_STUB,
  stubFuenteSecciones,
  type FuenteSeccionesStub,
} from '@contracts/emp/company-sections.stub';
import { usarFuenteSecciones } from '@/lib/secciones/fuente';

let mockUser: { id: string } | null = null;
let mockPerfil: { account_id: string } | null = null;
let refreshedCookies: Array<{
  name: string;
  value: string;
  options: Record<string, unknown>;
}> = [];

vi.mock('@supabase/ssr', () => ({
  createServerClient: (
    _url: string,
    _key: string,
    opts: { cookies: { setAll: (c: typeof refreshedCookies) => void } }
  ) => ({
    rpc: async () => ({ data: { ok: true } }),
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: mockPerfil, error: null }),
        }),
      }),
    }),
    auth: {
      getUser: async () => {
        if (refreshedCookies.length) opts.cookies.setAll(refreshedCookies);
        return { data: { user: mockUser } };
      },
    },
  }),
}));

const { middleware } = await import('./middleware');

const ROTATED = {
  name: 'sb-test-auth-token',
  value: 'rotated-refresh-token',
  options: { path: '/', httpOnly: true },
};

let s: FuenteSeccionesStub;

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
  mockUser = { id: 'u1' };
  mockPerfil = { account_id: CUENTA_STUB };
  refreshedCookies = [];
  s = stubFuenteSecciones();
  usarFuenteSecciones(s);
});

afterEach(() => usarFuenteSecciones(null));

const pide = (p: string) => middleware(new NextRequest(`https://app.test${p}`));

describe('middleware · secciones contratadas en /api', () => {
  it('con Agentes de IA apagada, /api/ai/… responde 403', async () => {
    s.apagar('agents');
    for (const p of [
      '/api/ai/draft',
      '/api/ai/knowledge/k1',
      '/api/ai/autoreply/c1',
    ])
      expect((await pide(p)).status).toBe(403);
  });

  it('con Agentes de IA apagada, /api/ai/config y /api/account/members pasan (rutas de cuenta)', async () => {
    s.apagar('agents');
    s.apagar('settings');
    for (const p of ['/api/ai/config', '/api/account/members']) {
      const res = await pide(p);
      expect(res.status).not.toBe(403);
    }
    // sus subrutas siguen cerradas con su sección
    expect((await pide('/api/account/members/u1')).status).toBe(403);
  });

  it('la libertad de /api/ai/config y /api/account/members es solo de lectura', async () => {
    s.apagar('agents');
    s.apagar('settings');
    const m = (p: string, method: string) =>
      middleware(new NextRequest(`https://app.test${p}`, { method }));
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect((await m('/api/ai/config', method)).status).toBe(403);
      expect((await m('/api/account/members', method)).status).toBe(403);
    }
    expect((await m('/api/ai/config', 'GET')).status).not.toBe(403);
    expect((await m('/api/ai/config', 'HEAD')).status).not.toBe(403);
    // con la sección prendida las escrituras pasan
    s.prender('agents');
    expect((await m('/api/ai/config', 'POST')).status).not.toBe(403);
  });

  it('con Agentes de IA prendida, /api/ai/draft pasa', async () => {
    const res = await pide('/api/ai/draft');
    expect(res.status).not.toBe(403);
    expect(res.headers.get('location')).toBeNull();
  });

  it('apagar y prender sin recrear nada (R3)', async () => {
    s.apagar('agents');
    expect((await pide('/api/ai/draft')).status).toBe(403);
    s.prender('agents');
    expect((await pide('/api/ai/draft')).status).not.toBe(403);
  });

  it('una ruta /api sin sección responde 403 (R18), con y sin usuario', async () => {
    for (const u of [{ id: 'u1' }, null]) {
      mockUser = u;
      for (const p of ['/api/ruta-nueva-de-upstream', '/api/account/nueva-cosa'])
        expect((await pide(p)).status).toBe(403);
    }
  });

  it('cuenta y sesión siguen funcionando', async () => {
    for (const p of [
      '/api/account',
      '/api/account/transfer-ownership',
      '/api/invitations/t/redeem',
    ])
      expect((await pide(p)).status).not.toBe(403);
    mockUser = null;
    for (const p of [
      '/login',
      '/auth/callback?code=x',
      '/api/invitations/t/peek',
      '/api/invitations/t/signup',
    ])
      expect((await pide(p)).status).not.toBe(403);
    mockUser = { id: 'u1' };
    const login = await pide('/login');
    expect(login.status).toBe(307);
    expect(new URL(login.headers.get('location')!).pathname).toBe('/dashboard');
  });

  it('webhook y cron de backup no se cierran', async () => {
    mockUser = null;
    for (const p of ['/api/whatsapp/webhook', '/api/backup/cron'])
      expect((await pide(p)).status).not.toBe(403);
  });

  it('sin sesión, una ruta de sección llega al handler', async () => {
    mockUser = null;
    s.apagar('contacts');
    expect((await pide('/api/v1/contacts')).status).not.toBe(403);
  });

  it('usuario sin cuenta en el perfil → 403', async () => {
    mockPerfil = null;
    expect((await pide('/api/ai/draft')).status).toBe(403);
  });

  it('el 403 lleva las cookies rotadas', async () => {
    refreshedCookies = [ROTATED];
    s.apagar('agents');
    const res = await pide('/api/ai/draft');
    expect(res.status).toBe(403);
    expect(res.cookies.get(ROTATED.name)?.value).toBe(ROTATED.value);
  });
});
