import { describe, expect, it } from 'vitest';
import { IDS_SECCION } from '@contracts/emp/company-sections';
import {
  CuentaEmpresaError,
  cambiarSeccion,
  cuentaDeEmpresa,
  esSeccionId,
  leerVista,
} from './vista-superadmin';
import { clienteFalso } from './vista-superadmin.fake';

const ID_E = '11111111-1111-4111-8111-111111111111';
const ID_P = '22222222-2222-4222-8222-222222222222';
const ID_E2 = '33333333-3333-4333-8333-333333333333';
const ID_X = '44444444-4444-4444-8444-444444444444';
const SUPER = { wacrm_superadmin: true };
const E = { id: ID_E, name: 'Empresa', owner_user_id: 'u-owner' };
const P = { id: ID_P, name: 'Personal', owner_user_id: 'u-super' };
const usuarios = { 'u-owner': {}, 'u-super': SUPER };
const todoPrendido = Object.fromEntries(
  IDS_SECCION.map((id) => [`${ID_E}|${id}`, true])
);

describe('cuentaDeEmpresa', () => {
  it('ignora la cuenta personal del superadmin', async () => {
    const { cliente } = clienteFalso({ cuentas: [E, P], usuarios });
    await expect(cuentaDeEmpresa(cliente)).resolves.toEqual({
      id: ID_E,
      nombre: 'Empresa',
    });
  });

  it('cero o dos cuentas de empresa lanzan CuentaEmpresaError', async () => {
    const cero = clienteFalso({ cuentas: [P], usuarios }).cliente;
    await expect(cuentaDeEmpresa(cero)).rejects.toMatchObject({
      encontradas: 0,
    });
    const dos = clienteFalso({
      cuentas: [E, { ...E, id: ID_E2, owner_user_id: 'u-otro' }],
      usuarios,
    }).cliente;
    const err = await cuentaDeEmpresa(dos).catch((e) => e);
    expect(err).toBeInstanceOf(CuentaEmpresaError);
    expect(err.encontradas).toBe(2);
  });
});

describe('leerVista', () => {
  it('lista las secciones en orden del catálogo con su estado', async () => {
    const { cliente } = clienteFalso({
      cuentas: [E, P],
      usuarios,
      filas: { ...todoPrendido, [`${ID_E}|flows`]: false },
    });
    const v = await leerVista(cliente);
    expect(v.secciones.map((s) => s.id)).toEqual([...IDS_SECCION]);
    expect(v.secciones.find((s) => s.id === 'flows')?.prendida).toBe(false);
    expect(v.secciones.find((s) => s.id === 'agents')?.nombre).toBe(
      'Agentes de IA'
    );
  });

  it('sin fila = apagada', async () => {
    const { cliente } = clienteFalso({ cuentas: [E], usuarios });
    const v = await leerVista(cliente);
    expect(v.secciones.every((s) => !s.prendida)).toBe(true);
  });
});

describe('cambiarSeccion', () => {
  it('apaga y prende agents y leerVista lo refleja en la siguiente llamada (R3)', async () => {
    const { cliente, upsert } = clienteFalso({
      cuentas: [E],
      usuarios,
      filas: todoPrendido,
    });
    await cambiarSeccion(cliente, ID_E, 'agents', false);
    expect(
      (await leerVista(cliente)).secciones.find((s) => s.id === 'agents')
        ?.prendida
    ).toBe(false);
    await cambiarSeccion(cliente, ID_E, 'agents', true);
    expect(
      (await leerVista(cliente)).secciones.find((s) => s.id === 'agents')
        ?.prendida
    ).toBe(true);
    expect(upsert.mock.calls[0][1]).toEqual({
      onConflict: 'account_id,seccion_id',
    });
  });

  it('no toca otra cuenta', async () => {
    const { cliente, filas } = clienteFalso({
      cuentas: [E],
      usuarios,
      filas: { [`${ID_X}|agents`]: true },
    });
    await cambiarSeccion(cliente, ID_E, 'agents', false);
    expect(filas.get(`${ID_X}|agents`)).toBe(true);
  });

  it('un error del upsert se lanza', async () => {
    const { cliente } = clienteFalso({
      cuentas: [E],
      usuarios,
      errorUpsert: true,
    });
    await expect(
      cambiarSeccion(cliente, ID_E, 'agents', false)
    ).rejects.toThrow(/boom interno/);
  });
});

describe('esSeccionId', () => {
  it('rechaza reportes y acepta agents', () => {
    expect(esSeccionId('reportes')).toBe(false);
    expect(esSeccionId('agents')).toBe(true);
  });
});
