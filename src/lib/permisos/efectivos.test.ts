import { describe, expect, it } from 'vitest';
import {
  recortarPorContratadas,
  type SeccionId,
} from '@contracts/emp/company-sections';
import {
  CUENTA_STUB,
  stubFuenteSecciones,
} from '@contracts/emp/company-sections.stub';
import {
  IDS_STUB,
  PERFILES_STUB,
} from '@contracts/usr/effective-permissions.stub';
import {
  PERFILES_FABRICA,
  crearObtenerPermisosEfectivos,
  leerMiembroSupabase,
  type LeerMiembro,
  type Miembro,
} from './efectivos';

const CUENTA = CUENTA_STUB;
const USUARIO = IDS_STUB.asesor;
const PERFIL_ID = IDS_STUB.perfilAsesor;

const perfil = (nombre: string): NonNullable<Miembro['perfil']> => ({
  id: PERFIL_ID,
  nombre,
  secciones: [
    ...(PERFILES_FABRICA.find((p) => p.nombre === nombre)?.secciones ?? []),
  ],
});

const lector =
  (m: Miembro | null): LeerMiembro =>
  async () =>
    m;

describe('crearObtenerPermisosEfectivos', () => {
  it('owner y admin reciben todo lo contratado y perfil null', async () => {
    const fuente = stubFuenteSecciones();
    fuente.apagar('flows');
    const esperado = (await fuente.contratadas(CUENTA)).secciones;
    expect(esperado).not.toContain('flows');
    for (const rolCuenta of ['owner', 'admin'] as const) {
      const obtener = crearObtenerPermisosEfectivos({
        fuente,
        leer: lector({ rolCuenta, perfil: null }),
      });
      const p = await obtener({ cuentaId: CUENTA, usuarioId: USUARIO });
      expect(p?.rol).toBe(rolCuenta);
      expect(p?.perfil).toBeNull();
      expect(p?.secciones).toEqual(esperado);
    }
  });

  it('admin con una fila de perfil la ignora (R17)', async () => {
    const obtener = crearObtenerPermisosEfectivos({
      fuente: stubFuenteSecciones(),
      leer: lector({ rolCuenta: 'admin', perfil: perfil('Asesor') }),
    });
    const p = await obtener({ cuentaId: CUENTA, usuarioId: USUARIO });
    expect(p?.perfil).toBeNull();
    expect(p?.secciones).toContain('settings');
  });

  it('Marketing con Agentes de IA apagada no recibe agents', async () => {
    const fuente = stubFuenteSecciones();
    fuente.apagar('agents');
    const obtener = crearObtenerPermisosEfectivos({
      fuente,
      leer: lector({ rolCuenta: 'agent', perfil: perfil('Marketing') }),
    });
    const p = await obtener({ cuentaId: CUENTA, usuarioId: USUARIO });
    expect(p?.secciones).not.toContain('agents');
    expect(p?.secciones).toContain('broadcasts');
    expect(p?.secciones).not.toContain('settings');
  });

  it('el recorte es igual a recortarPorContratadas de I1', async () => {
    const fuente = stubFuenteSecciones();
    fuente.apagar('flows');
    const contratadas = await fuente.contratadas(CUENTA);
    for (const pf of PERFILES_FABRICA) {
      const obtener = crearObtenerPermisosEfectivos({
        fuente,
        leer: lector({ rolCuenta: 'agent', perfil: perfil(pf.nombre) }),
      });
      const p = await obtener({ cuentaId: CUENTA, usuarioId: USUARIO });
      expect(p?.secciones).toEqual(
        recortarPorContratadas(pf.secciones as SeccionId[], contratadas)
      );
    }
  });

  it('usuario sin perfil no tiene secciones (R8)', async () => {
    const obtener = crearObtenerPermisosEfectivos({
      fuente: stubFuenteSecciones(),
      leer: lector({ rolCuenta: 'agent', perfil: null }),
    });
    const p = await obtener({ cuentaId: CUENTA, usuarioId: USUARIO });
    expect(p).toMatchObject({ rol: 'usuario', perfil: null, secciones: [] });
  });

  it('viewer heredado es usuario sin perfil', async () => {
    const obtener = crearObtenerPermisosEfectivos({
      fuente: stubFuenteSecciones(),
      leer: lector({ rolCuenta: 'viewer', perfil: null }),
    });
    const p = await obtener({ cuentaId: CUENTA, usuarioId: USUARIO });
    expect(p).toMatchObject({ rol: 'usuario', perfil: null, secciones: [] });
  });

  it('una sección desconocida del perfil se cae', async () => {
    const obtener = crearObtenerPermisosEfectivos({
      fuente: stubFuenteSecciones(),
      leer: lector({
        rolCuenta: 'agent',
        perfil: {
          id: PERFIL_ID,
          nombre: 'Raro',
          secciones: ['reportes', 'inbox'],
        },
      }),
    });
    const p = await obtener({ cuentaId: CUENTA, usuarioId: USUARIO });
    expect(p?.secciones).toEqual(['inbox']);
  });

  it('no miembro → null', async () => {
    const obtener = crearObtenerPermisosEfectivos({
      fuente: stubFuenteSecciones(),
      leer: lector(null),
    });
    expect(await obtener({ cuentaId: CUENTA, usuarioId: USUARIO })).toBeNull();
  });

  it('un error del lector o de la fuente se lanza', async () => {
    const roto = crearObtenerPermisosEfectivos({
      fuente: stubFuenteSecciones(),
      leer: async () => {
        throw new Error('base caída');
      },
    });
    await expect(
      roto({ cuentaId: CUENTA, usuarioId: USUARIO })
    ).rejects.toThrow('base caída');
    const fuenteRota = crearObtenerPermisosEfectivos({
      fuente: {
        catalogo: async () => [],
        contratadas: async () => {
          throw new Error('fuente caída');
        },
      },
      leer: lector({ rolCuenta: 'admin', perfil: null }),
    });
    await expect(
      fuenteRota({ cuentaId: CUENTA, usuarioId: USUARIO })
    ).rejects.toThrow('fuente caída');
  });
});

describe('PERFILES_FABRICA', () => {
  it('coincide con PERFILES_STUB de I2', () => {
    const stub = Object.values(PERFILES_STUB).map((p) => [
      p.ref.nombre,
      p.secciones,
    ]);
    expect(PERFILES_FABRICA.map((p) => [p.nombre, p.secciones])).toEqual(stub);
  });
});

describe('leerMiembroSupabase', () => {
  const cliente = (res: unknown) =>
    ({ rpc: async () => res }) as unknown as Parameters<
      typeof leerMiembroSupabase
    >[0];
  const q = { cuentaId: CUENTA, usuarioId: USUARIO };

  it('llama la RPC y arma el miembro', async () => {
    const leer = leerMiembroSupabase(
      cliente({
        data: [
          {
            account_role: 'agent',
            perfil_id: PERFIL_ID,
            perfil_nombre: 'Asesor',
            perfil_secciones: ['inbox'],
          },
        ],
        error: null,
      })
    );
    expect(await leer(q)).toEqual({
      rolCuenta: 'agent',
      perfil: { id: PERFIL_ID, nombre: 'Asesor', secciones: ['inbox'] },
    });
  });

  it('perfil_id nulo → perfil null; sin filas → null', async () => {
    const sinPerfil = leerMiembroSupabase(
      cliente({
        data: [
          {
            account_role: 'viewer',
            perfil_id: null,
            perfil_nombre: null,
            perfil_secciones: null,
          },
        ],
        error: null,
      })
    );
    expect(await sinPerfil(q)).toEqual({ rolCuenta: 'viewer', perfil: null });
    expect(
      await leerMiembroSupabase(cliente({ data: [], error: null }))(q)
    ).toBeNull();
  });

  it('un error de la RPC se lanza', async () => {
    const leer = leerMiembroSupabase(
      cliente({ data: null, error: { message: 'x' } })
    );
    await expect(leer(q)).rejects.toThrow(/no se pudo leer el miembro/);
  });
});
