// Lado SRV.2 de I2: la decisión corre contra el stub de CT.2
import { describe, expect, it, vi } from 'vitest';
import {
  CUENTA_STUB,
  stubFuenteSecciones,
} from '@contracts/emp/company-sections.stub';
import type { FuenteSecciones } from '@contracts/emp/company-sections';
import {
  IDS_STUB,
  SECCIONES_STUB,
  stubObtenerPermisos,
  stubPermisos,
} from '@contracts/usr/effective-permissions.stub';
import { decidirAccesoUsuario } from './acceso';

const envolver = (f: ReturnType<typeof stubFuenteSecciones>): FuenteSecciones => ({
  catalogo: f.catalogo,
  contratadas: async (c) => ({
    ...(await f.contratadas(CUENTA_STUB)),
    cuentaId: c,
  }),
});

const q = (usuarioId: string, superadmin = false) => ({
  cuentaId: IDS_STUB.cuenta as string | null,
  usuarioId,
  superadmin,
});

const cont = stubPermisos({ rol: 'usuario', perfil: 'contestador' });
const mkt = stubPermisos({ rol: 'usuario', perfil: 'marketing' });
const sin = stubPermisos({ rol: 'usuario' });
const owner = stubPermisos({ rol: 'owner' });
const obtener = stubObtenerPermisos([cont, mkt, sin, owner]);
const fuente = () => envolver(stubFuenteSecciones());
const pasa = { tipo: 'pasa' };

describe('decidirAccesoUsuario', () => {
  it('Contestador: inbox y notifications pasan; settings y su /api no', async () => {
    const d = { obtener, fuente: fuente() };
    for (const p of ['/inbox', '/notifications', '/api/whatsapp/send'])
      expect(await decidirAccesoUsuario(p, q(cont.usuarioId), d)).toEqual(pasa);
    for (const p of [
      '/settings',
      '/api/account/members/m1',
      '/api/whatsapp/config',
      '/api/v1/webhooks',
    ])
      expect(await decidirAccesoUsuario(p, q(cont.usuarioId), d)).toEqual({
        tipo: 'sin-permiso',
        seccion: 'settings',
        permitidas: ['inbox', 'notifications'],
      });
  });

  it('Marketing: todo lo contratado menos settings', async () => {
    const d = { obtener, fuente: fuente() };
    const rutas: Record<string, string> = {
      dashboard: '/dashboard',
      inbox: '/inbox',
      notifications: '/notifications',
      contacts: '/contacts',
      pipelines: '/pipelines',
      broadcasts: '/broadcasts',
      automations: '/automations',
      flows: '/flows',
      agents: '/agents',
    };
    for (const id of SECCIONES_STUB.filter((s) => s !== 'settings'))
      expect(
        await decidirAccesoUsuario(rutas[id], q(mkt.usuarioId), d)
      ).toEqual(pasa);
    expect(
      (await decidirAccesoUsuario('/settings', q(mkt.usuarioId), d)).tipo
    ).toBe('sin-permiso');
  });

  it('Marketing con agents apagada: apagada, no sin-permiso (R7)', async () => {
    const f = stubFuenteSecciones();
    f.apagar('agents');
    const ob = stubObtenerPermisos([
      stubPermisos({
        rol: 'usuario',
        perfil: 'marketing',
        contratadas: SECCIONES_STUB.filter((s) => s !== 'agents'),
      }),
    ]);
    expect(
      await decidirAccesoUsuario('/agents', q(mkt.usuarioId), {
        obtener: ob,
        fuente: envolver(f),
      })
    ).toEqual({ tipo: 'apagada', seccion: 'agents' });
  });

  it('sin perfil: ninguna sección; cuenta y sesión pasan', async () => {
    const d = { obtener, fuente: fuente() };
    for (const p of ['/inbox', '/settings', '/api/contacts', '/dashboard'])
      expect(
        await decidirAccesoUsuario(p, q(sin.usuarioId), d)
      ).toMatchObject({ tipo: 'sin-permiso', permitidas: [] });
    for (const p of ['/api/account', '/cuenta', '/login'])
      expect(await decidirAccesoUsuario(p, q(sin.usuarioId), d)).toEqual(pasa);
  });

  it('owner: todo lo contratado', async () => {
    const d = { obtener, fuente: fuente() };
    for (const p of ['/settings', '/api/ai/draft', '/inbox'])
      expect(await decidirAccesoUsuario(p, q(owner.usuarioId), d)).toEqual(pasa);
  });

  it('null de I2 → sin-permiso', async () => {
    expect(
      await decidirAccesoUsuario('/inbox', q('desconocido'), {
        obtener,
        fuente: fuente(),
      })
    ).toEqual({ tipo: 'sin-permiso', seccion: 'inbox', permitidas: [] });
  });

  it('I2 que lanza → sin-permiso y console.error', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await decidirAccesoUsuario('/inbox', q(cont.usuarioId), {
      obtener: async () => {
        throw new Error('x');
      },
      fuente: fuente(),
    });
    expect(r).toEqual({ tipo: 'sin-permiso', seccion: 'inbox', permitidas: [] });
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it('sin cuenta → sin-permiso', async () => {
    expect(
      await decidirAccesoUsuario(
        '/inbox',
        { cuentaId: null, usuarioId: cont.usuarioId, superadmin: false },
        { obtener, fuente: fuente() }
      )
    ).toMatchObject({ tipo: 'sin-permiso' });
  });

  it('rutas de cuenta de CT.1: lectura libre; escritura bajo su sección', async () => {
    const d = { obtener, fuente: fuente() };
    for (const u of [cont.usuarioId, sin.usuarioId])
      for (const p of ['/api/account/members', '/api/ai/config'])
        for (const metodo of ['GET', 'HEAD'])
          expect(
            await decidirAccesoUsuario(p, q(u), { ...d, metodo })
          ).toEqual(pasa);
    expect(
      await decidirAccesoUsuario('/api/account/members', q(cont.usuarioId), {
        ...d,
        metodo: 'POST',
      })
    ).toMatchObject({ tipo: 'sin-permiso', seccion: 'settings' });
    expect(
      await decidirAccesoUsuario('/api/ai/config', q(cont.usuarioId), {
        ...d,
        metodo: 'PUT',
      })
    ).toMatchObject({ tipo: 'sin-permiso', seccion: 'agents' });
    expect(
      await decidirAccesoUsuario('/api/account/members/m1', q(cont.usuarioId), d)
    ).toMatchObject({ tipo: 'sin-permiso', seccion: 'settings' });
  });

  it('ruta sin sección → sin-seccion salvo superadmin (R18)', async () => {
    const d = { obtener, fuente: fuente() };
    expect(
      await decidirAccesoUsuario('/api/ruta-nueva', q(owner.usuarioId), d)
    ).toEqual({ tipo: 'sin-seccion' });
  });

  it('superadmin no depende de I2', async () => {
    const lanza = async () => {
      throw new Error('x');
    };
    expect(
      await decidirAccesoUsuario('/api/ai/draft', q('sa', true), {
        obtener: lanza,
        fuente: fuente(),
      })
    ).toEqual(pasa);
    const f = stubFuenteSecciones();
    f.apagar('agents');
    expect(
      await decidirAccesoUsuario('/api/ai/draft', q('sa', true), {
        obtener: lanza,
        fuente: envolver(f),
      })
    ).toEqual({ tipo: 'apagada', seccion: 'agents' });
    expect(
      await decidirAccesoUsuario('/api/ruta-nueva', q('sa', true), {
        obtener: lanza,
        fuente: fuente(),
      })
    ).toEqual(pasa);
  });
});
