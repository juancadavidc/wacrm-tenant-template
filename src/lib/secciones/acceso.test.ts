// Lado SRV.1 de I1: la decisión corre contra el stub de CT.1
import { afterEach, describe, expect, it } from 'vitest';
import {
  CUENTA_STUB,
  stubFuenteSecciones,
} from '@contracts/emp/company-sections.stub';
import { clasificarRuta, decidirAcceso, RUTAS_API_LIBRES } from './acceso';
import { usarFuenteSecciones } from './fuente';

const f = () => stubFuenteSecciones();

afterEach(() => usarFuenteSecciones(null));

describe('clasificarRuta', () => {
  it.each([
    ['/api/ai/draft', { tipo: 'seccion', seccion: 'agents', esApi: true }],
    ['/agents', { tipo: 'seccion', seccion: 'agents', esApi: false }],
    ['/api/account', { tipo: 'libre' }],
    ['/api/account/', { tipo: 'libre' }],
    ['/api/account/transfer-ownership', { tipo: 'libre' }],
    ['/api/invitations/abc/redeem', { tipo: 'libre' }],
    ['/api/v1/me', { tipo: 'libre' }],
    ['/api/account/members', { tipo: 'libre' }],
    ['/api/ai/config', { tipo: 'libre' }],
    ['/api/whatsapp/webhook', { tipo: 'libre' }],
    ['/api/backup/cron', { tipo: 'libre' }],
    ['/api/account/nueva-cosa', { tipo: 'sin-seccion' }],
    ['/api/accountx', { tipo: 'sin-seccion' }],
    ['/api/invitationsfoo', { tipo: 'sin-seccion' }],
    ['/api/ruta-nueva-de-upstream', { tipo: 'sin-seccion' }],
    ['/api', { tipo: 'sin-seccion' }],
    ['/login', { tipo: 'no-aplica' }],
    ['/auth/callback', { tipo: 'no-aplica' }],
    ['/join/abc', { tipo: 'no-aplica' }],
    ['/sin-acceso', { tipo: 'no-aplica' }],
  ])('%s', (p, esperado) => expect(clasificarRuta(p)).toEqual(esperado));

  it('las lecturas de cuenta de CT.1 (members raíz, ai/config) quedan libres', () => {
    const libres = RUTAS_API_LIBRES.map((r) => r.ruta);
    expect(libres).toContain('/api/account/members');
    expect(libres).toContain('/api/ai/config');
  });

  it('sus subrutas y escrituras siguen en su sección', () => {
    expect(clasificarRuta('/api/account/members/u1')).toEqual({
      tipo: 'seccion',
      seccion: 'settings',
      esApi: true,
    });
    expect(clasificarRuta('/api/ai/config/x')).toEqual({
      tipo: 'seccion',
      seccion: 'agents',
      esApi: true,
    });
  });
});

describe('decidirAcceso contra el stub de CT.1', () => {
  it('con Agentes de IA apagada, /api/ai/… y /agents quedan apagadas', async () => {
    const s = f();
    s.apagar('agents');
    for (const p of ['/api/ai/draft', '/agents'])
      expect(await decidirAcceso(p, CUENTA_STUB, s)).toEqual({
        tipo: 'apagada',
        seccion: 'agents',
      });
    expect(await decidirAcceso('/api/contacts/x/tags', CUENTA_STUB, s)).toEqual(
      { tipo: 'pasa' }
    );
  });

  it('con Agentes de IA apagada, /api/ai/config y /api/account/members siguen pasando', async () => {
    const s = f([]);
    for (const p of ['/api/ai/config', '/api/account/members'])
      expect(await decidirAcceso(p, CUENTA_STUB, s)).toEqual({ tipo: 'pasa' });
  });

  it('prender de nuevo reabre con la misma fuente (R3)', async () => {
    const s = f();
    s.apagar('agents');
    s.prender('agents');
    expect(await decidirAcceso('/api/ai/draft', CUENTA_STUB, s)).toEqual({
      tipo: 'pasa',
    });
  });

  it('sin sección → sin-seccion, aunque todo esté prendido (R18)', async () => {
    expect(await decidirAcceso('/api/ruta-nueva', CUENTA_STUB, f())).toEqual({
      tipo: 'sin-seccion',
    });
  });

  it('rutas libres y páginas fuera del catálogo pasan sin cuenta', async () => {
    for (const p of ['/api/account', '/api/invitations/t/peek', '/login'])
      expect(await decidirAcceso(p, null, f())).toEqual({ tipo: 'pasa' });
  });

  it('sección sin cuenta → apagada', async () => {
    expect((await decidirAcceso('/api/ai/draft', null, f())).tipo).toBe(
      'apagada'
    );
  });

  it('si la fuente falla, niega', async () => {
    const rota = {
      ...f(),
      contratadas: async () => {
        throw new Error('db');
      },
    };
    const err = console.error;
    console.error = () => {};
    try {
      expect((await decidirAcceso('/api/ai/draft', CUENTA_STUB, rota)).tipo).toBe(
        'apagada'
      );
    } finally {
      console.error = err;
    }
  });

  it('la fuente por defecto es todo contratado; usarFuenteSecciones la cambia', async () => {
    expect(await decidirAcceso('/api/ai/draft', CUENTA_STUB)).toEqual({
      tipo: 'pasa',
    });
    const s = f();
    s.apagar('agents');
    usarFuenteSecciones(s);
    expect((await decidirAcceso('/api/ai/draft', CUENTA_STUB)).tipo).toBe(
      'apagada'
    );
  });
});
