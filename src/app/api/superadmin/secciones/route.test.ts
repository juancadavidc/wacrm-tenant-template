import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  crearFuenteSecciones,
  leerContratadasSupabase,
} from '@/lib/permisos/secciones';
import { IDS_SECCION } from '@contracts/emp/company-sections';
import { clienteFalso } from '@/lib/permisos/vista-superadmin.fake';

const ID_E = '11111111-1111-4111-8111-111111111111';
const ID_P = '22222222-2222-4222-8222-222222222222';
const ID_E2 = '33333333-3333-4333-8333-333333333333';
const ID_X = '44444444-4444-4444-8444-444444444444';
const SUPER = { id: 'u-super', app_metadata: { wacrm_superadmin: true } };
const OWNER = { id: 'u-owner', app_metadata: {} };
const ADMIN = { id: 'u-admin', app_metadata: { provider: 'email' } };

process.env['EMPRESA_ACCOUNT_ID'] = ID_E;

let mockUser: unknown = null;
let falso = armar();

type Opc = Parameters<typeof clienteFalso>[0];

function armar(over: Partial<Opc> = {}) {
  return clienteFalso({
    cuentas: [
      { id: ID_E, name: 'Empresa', owner_user_id: 'u-owner' },
      { id: ID_P, name: 'Personal', owner_user_id: 'u-super' },
    ],
    usuarios: { 'u-owner': {}, 'u-super': SUPER.app_metadata },
    filas: Object.fromEntries(IDS_SECCION.map((id) => [`${ID_E}|${id}`, true])),
    ...over,
  });
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: mockUser },
        error: null,
      }),
    },
  }),
}));
vi.mock('@/lib/automations/admin-client', () => ({
  supabaseAdmin: () => falso.cliente,
}));

const { GET } = await import('./route');
const { PATCH } = await import('./[id]/route');

function patch(id: string, body: unknown) {
  return PATCH(
    new Request(`https://app.test/api/superadmin/secciones/${id}`, {
      method: 'PATCH',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  );
}

async function estadoAgents(r: Response) {
  const v = await r.json();
  return v.secciones.find((s: { id: string }) => s.id === 'agents').prendida;
}

beforeEach(() => {
  mockUser = SUPER;
  falso = armar();
});

describe('/api/superadmin/secciones', () => {
  it.each([
    ['owner', OWNER],
    ['admin', ADMIN],
  ])('%s recibe 403 en GET y PATCH', async (_n, usuario) => {
    mockUser = usuario;
    expect((await GET()).status).toBe(403);
    expect((await patch('agents', { prendida: false })).status).toBe(403);
    expect(falso.upsert).not.toHaveBeenCalled();
  });

  it('el 403 va antes de validar', async () => {
    mockUser = OWNER;
    expect((await patch('reportes', 'x')).status).toBe(403);
  });

  it('sin sesión → 401', async () => {
    mockUser = null;
    expect((await GET()).status).toBe(401);
    expect((await patch('agents', { prendida: false })).status).toBe(401);
  });

  it('el superadmin apaga Agentes de IA y la vuelve a prender sin redesplegar', async () => {
    const fuente = () =>
      crearFuenteSecciones(leerContratadasSupabase(falso.cliente)).contratadas(
        ID_E
      );
    let r = await patch('agents', { prendida: false });
    expect(r.status).toBe(200);
    expect(await estadoAgents(r)).toBe(false);
    expect(await estadoAgents(await GET())).toBe(false);
    expect((await fuente()).secciones).not.toContain('agents');
    r = await patch('agents', { prendida: true });
    expect(await estadoAgents(r)).toBe(true);
    expect((await fuente()).secciones).toContain('agents');
  });

  it('id desconocido → 404', async () => {
    expect((await patch('reportes', { prendida: true })).status).toBe(404);
  });

  it.each([[{}], [{ prendida: 'no' }], [{ prendida: true, extra: 1 }]])(
    'cuerpo inválido → 400 (%j)',
    async (body) => {
      expect((await patch('agents', body)).status).toBe(400);
    }
  );

  it('sin EMPRESA_ACCOUNT_ID → 503 y no escribe', async () => {
    delete process.env['EMPRESA_ACCOUNT_ID'];
    try {
      expect((await GET()).status).toBe(503);
      expect((await patch('agents', { prendida: false })).status).toBe(503);
      expect(falso.upsert).not.toHaveBeenCalled();
    } finally {
      process.env['EMPRESA_ACCOUNT_ID'] = ID_E;
    }
  });

  it('error de la base → 500 sin el mensaje interno', async () => {
    falso = armar({ errorUpsert: true });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await patch('agents', { prendida: false });
    expect(r.status).toBe(500);
    expect(JSON.stringify(await r.json())).not.toMatch(/boom/);
  });
});
