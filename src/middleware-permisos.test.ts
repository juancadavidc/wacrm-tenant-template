import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  CUENTA_STUB,
  stubFuenteSecciones,
} from '@contracts/emp/company-sections.stub';
import type { FuenteSecciones } from '@contracts/emp/company-sections';
import {
  IDS_STUB,
  stubObtenerPermisos,
  stubPermisos,
} from '@contracts/usr/effective-permissions.stub';
import { usarFuenteSecciones } from '@/lib/secciones/fuente';
import { usarObtenerPermisos } from '@/lib/secciones/permisos';

let mockUser: {
  id: string;
  app_metadata: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
} | null = null;
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

const contestador = stubPermisos({ rol: 'usuario', perfil: 'contestador' });
const sinPerfil = stubPermisos({ rol: 'usuario' });
const marketing = stubPermisos({ rol: 'usuario', perfil: 'marketing' });
const owner = stubPermisos({ rol: 'owner' });

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
  mockUser = { id: IDS_STUB.contestador, app_metadata: {} };
  mockPerfil = { account_id: IDS_STUB.cuenta };
  refreshedCookies = [];
  const f = stubFuenteSecciones();
  const fuente: FuenteSecciones = {
    catalogo: f.catalogo,
    contratadas: async (c) => ({
      ...(await f.contratadas(CUENTA_STUB)),
      cuentaId: c,
    }),
  };
  usarFuenteSecciones(fuente);
  usarObtenerPermisos(
    stubObtenerPermisos([contestador, sinPerfil, marketing, owner])
  );
});

afterEach(() => {
  usarFuenteSecciones(null);
  usarObtenerPermisos(null);
});

const pide = (p: string, method = 'GET') =>
  middleware(new NextRequest(`https://app.test${p}`, { method }));

describe('middleware · /api según el perfil', () => {
  it('Contestador: las rutas /api de Configuración responden 403', async () => {
    for (const p of [
      '/api/whatsapp/config',
      '/api/whatsapp/templates',
      '/api/account/members/m1',
      '/api/account/invitations',
      '/api/account/api-keys',
      '/api/v1/webhooks',
    ]) {
      const res = await pide(p);
      expect(res.status, p).toBe(403);
      expect(await res.json()).toEqual({ error: 'Forbidden' });
    }
  });

  it('rutas de cuenta de CT.1: lectura libre para todo perfil, escritura con su sección', async () => {
    for (const id of [IDS_STUB.contestador, IDS_STUB.sinPerfil]) {
      mockUser = { id, app_metadata: {} };
      for (const p of ['/api/account/members', '/api/ai/config'])
        expect((await pide(p)).status, p).not.toBe(403);
    }
    mockUser = { id: IDS_STUB.contestador, app_metadata: {} };
    expect((await pide('/api/account/members/m1')).status).toBe(403);
    expect((await pide('/api/account/members', 'POST')).status).toBe(403);
    expect((await pide('/api/ai/config', 'PUT')).status).toBe(403);
  });

  it('Contestador: /api/whatsapp/send pasa', async () => {
    expect((await pide('/api/whatsapp/send', 'POST')).status).not.toBe(403);
  });

  it('sin perfil: /api/contacts responde 403; /api/account pasa', async () => {
    mockUser = { id: IDS_STUB.sinPerfil, app_metadata: {} };
    expect((await pide('/api/contacts')).status).toBe(403);
    expect((await pide('/api/account')).status).not.toBe(403);
  });

  it('superadmin no depende de I2', async () => {
    usarObtenerPermisos(async () => {
      throw new Error('x');
    });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockUser = { id: 'sa', app_metadata: { wacrm_superadmin: true } };
    expect((await pide('/api/ai/draft')).status).not.toBe(403);
    // user_metadata no cuenta
    mockUser = {
      id: 'x',
      app_metadata: {},
      user_metadata: { wacrm_superadmin: true },
    };
    expect((await pide('/api/ai/draft')).status).toBe(403);
    err.mockRestore();
  });

  it('el 403 lleva las cookies rotadas', async () => {
    refreshedCookies = [
      {
        name: 'sb-test-auth-token',
        value: 'rotated',
        options: { path: '/' },
      },
    ];
    const res = await pide('/api/whatsapp/config');
    expect(res.status).toBe(403);
    expect(res.cookies.get('sb-test-auth-token')?.value).toBe('rotated');
  });
});

describe('middleware · páginas según el perfil', () => {
  const reescrito = (res: Response) => res.headers.get('x-middleware-rewrite');

  it('Contestador: /settings se reescribe a sin acceso por perfil', async () => {
    for (const p of ['/settings', '/settings?tab=profile']) {
      const res = await pide(p);
      expect(reescrito(res), p).toContain(
        '/sin-acceso?seccion=settings&motivo=perfil'
      );
      expect(res.headers.get('location')).toBeNull();
    }
  });

  it('Contestador en /dashboard va a /inbox', async () => {
    const res = await pide('/dashboard');
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toMatch(/\/inbox$/);
  });

  it('sin perfil en /dashboard va a /cuenta (sin bucle)', async () => {
    mockUser = { id: IDS_STUB.sinPerfil, app_metadata: {} };
    const res = await pide('/dashboard');
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toMatch(/\/cuenta$/);
    expect((await pide('/cuenta')).status).toBe(200);
  });

  it('Contestador con dashboard apagado: /dashboard va a /inbox', async () => {
    const f = stubFuenteSecciones();
    f.apagar('dashboard');
    usarFuenteSecciones({
      catalogo: f.catalogo,
      contratadas: async (c) => ({ ...(await f.contratadas(CUENTA_STUB)), cuentaId: c }),
    });
    const res = await pide('/dashboard');
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toMatch(/\/inbox$/);
    expect(reescrito(await pide('/inbox'))).toBeNull();
  });

  it('Marketing: /agents pasa; con agents apagada, motivo=apagada', async () => {
    mockUser = { id: IDS_STUB.marketing, app_metadata: {} };
    expect(reescrito(await pide('/agents'))).toBeNull();
    usarObtenerPermisos(
      stubObtenerPermisos([
        stubPermisos({
          rol: 'usuario',
          perfil: 'marketing',
          contratadas: ['inbox', 'contacts'],
        }),
      ])
    );
    usarFuenteSecciones(null);
    const f = stubFuenteSecciones();
    f.apagar('agents');
    usarFuenteSecciones({
      catalogo: f.catalogo,
      contratadas: async (c) => ({ ...(await f.contratadas(CUENTA_STUB)), cuentaId: c }),
    });
    expect(reescrito(await pide('/agents'))).toContain('motivo=apagada');
  });

  it('/cuenta nunca se reescribe', async () => {
    for (const id of [IDS_STUB.contestador, IDS_STUB.sinPerfil]) {
      mockUser = { id, app_metadata: {} };
      const res = await pide('/cuenta');
      expect(reescrito(res)).toBeNull();
      expect(res.status).toBe(200);
    }
  });
});
