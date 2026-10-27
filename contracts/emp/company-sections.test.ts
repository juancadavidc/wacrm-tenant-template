import { describe, expect, it } from 'vitest';
import {
  CATALOGO_V1,
  CatalogoSchema,
  SeccionesContratadasSchema,
  recortarPorContratadas,
  seccionDeApi,
  seccionDeRuta,
  type Seccion,
  type SeccionId,
} from './company-sections';

const UUID = '11111111-1111-4111-8111-111111111111';
const base = () => structuredClone(CATALOGO_V1) as Seccion[];
const ok = (b: unknown) => CatalogoSchema.safeParse(b).success;

describe('catálogo v1', () => {
  it('tiene las 10 secciones de 03-alcance con su ruta', () => {
    expect(CATALOGO_V1.map((s) => [s.id, s.ruta])).toEqual([
      ['dashboard', '/dashboard'],
      ['inbox', '/inbox'],
      ['notifications', '/notifications'],
      ['contacts', '/contacts'],
      ['pipelines', '/pipelines'],
      ['broadcasts', '/broadcasts'],
      ['automations', '/automations'],
      ['flows', '/flows'],
      ['agents', '/agents'],
      ['settings', '/settings'],
    ]);
    expect(CATALOGO_V1.find((s) => s.id === 'agents')?.nombre).toBe(
      'Agentes de IA'
    );
  });
  it('agents es dueño de /api/ai', () => {
    expect(CATALOGO_V1.find((s) => s.id === 'agents')?.prefijosApi).toEqual([
      '/api/ai',
    ]);
  });
});

describe('CatalogoSchema', () => {
  it('acepta el catálogo v1', () => expect(ok(base())).toBe(true));
  it('rechaza ids repetidos', () => {
    const b = base();
    b[1].id = 'dashboard';
    expect(ok(b)).toBe(false);
  });
  it('rechaza rutas repetidas', () => {
    const b = base();
    b[1].ruta = '/dashboard';
    expect(ok(b)).toBe(false);
  });
  it('rechaza un prefijo en dos secciones', () => {
    const b = base();
    b[0].prefijosApi.push('/api/ai');
    expect(ok(b)).toBe(false);
  });
  it('rechaza prefijos anidados entre secciones', () => {
    const b = base();
    b[0].prefijosApi.push('/api/ai/draft');
    expect(ok(b)).toBe(false);
  });
  it('rechaza llaves de más y prefijos que no empiezan por /api', () => {
    const extra = base();
    (extra[0] as Record<string, unknown>).otra = 1;
    expect(ok(extra)).toBe(false);
    const malo = base();
    malo[0].prefijosApi.push('/otro/x');
    expect(ok(malo)).toBe(false);
  });
});

describe('SeccionesContratadasSchema', () => {
  it('rechaza un id fuera del catálogo', () => {
    expect(
      SeccionesContratadasSchema.safeParse({
        cuentaId: UUID,
        secciones: ['crm'],
      }).success
    ).toBe(false);
  });
  it('rechaza ids repetidos', () => {
    expect(
      SeccionesContratadasSchema.safeParse({
        cuentaId: UUID,
        secciones: ['inbox', 'inbox'],
      }).success
    ).toBe(false);
  });
  it('acepta la lista vacía', () => {
    expect(
      SeccionesContratadasSchema.safeParse({ cuentaId: UUID, secciones: [] })
        .success
    ).toBe(true);
  });
});

describe('seccionDeRuta y seccionDeApi', () => {
  it.each([
    ['/agents', 'agents'],
    ['/agents/nuevo', 'agents'],
    ['/inbox?c=1', 'inbox'],
    ['/agents#x', 'agents'],
    ['/agents/', 'agents'],
    ['/agents-viejo', null],
    ['/login', null],
    ['/', null],
    ['/Agents', null],
  ])('página %s → %s', (p, id) =>
    expect(seccionDeRuta(CATALOGO_V1, p)).toBe(id)
  );

  it.each([
    ['/api/ai/draft', 'agents'],
    ['/api/ai', 'agents'],
    ['/api/ai/draft/', 'agents'],
    ['/api/aiextra', null],
    ['/api/whatsapp/send', 'inbox'],
    ['/api/whatsapp/broadcast/x/resume', 'broadcasts'],
    ['/api/whatsapp/config', 'settings'],
    ['/api/account', null],
    ['/api/account/members/u1', 'settings'],
    ['/api/v1/me', null],
    ['/api/whatsapp/webhook', null],
    ['/api/flows/cron', 'flows'],
  ])('api %s → %s', (p, id) => expect(seccionDeApi(CATALOGO_V1, p)).toBe(id));
});

describe('recortarPorContratadas', () => {
  it('es la intersección en orden de catálogo, sin repetidos (R7)', () => {
    expect(
      recortarPorContratadas(['agents', 'inbox', 'inbox', 'flows'], {
        cuentaId: UUID,
        secciones: ['inbox', 'agents'],
      })
    ).toEqual(['inbox', 'agents']);
  });
  it('con nada contratado devuelve []', () => {
    const pedidas: SeccionId[] = ['inbox', 'agents'];
    expect(
      recortarPorContratadas(pedidas, { cuentaId: UUID, secciones: [] })
    ).toEqual([]);
  });
});
