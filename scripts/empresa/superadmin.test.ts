import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MARCA_SUPERADMIN } from '../../src/lib/permisos/marca-superadmin';
import {
  MARCA,
  darSuperadmin,
  escribirVariableEnv,
  main,
} from './superadmin.mjs';

const EMPRESA = '11111111-1111-4111-8111-111111111111';
const PERSONAL = '22222222-2222-4222-8222-222222222222';
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

type Usuario = {
  id: string;
  email: string;
  app_metadata?: Record<string, unknown>;
};

function falso(opciones: {
  usuarios?: Usuario[];
  cuentas?: { id: string; owner_user_id: string }[];
  perfiles?: { user_id: string; account_id: string }[];
}) {
  const updateUserById = vi.fn(async (_id: string, _a: unknown) => ({
    data: {},
    error: null,
  }));
  const createUser = vi.fn(async (_a: unknown) => ({
    data: { user: { id: 'nuevo' } },
    error: null,
  }));
  const cuentas = opciones.cuentas ?? [
    { id: EMPRESA, owner_user_id: 'OW' },
  ];
  const perfiles = opciones.perfiles ?? [];
  const cliente = {
    auth: {
      admin: {
        listUsers: async () => ({
          data: { users: opciones.usuarios ?? [] },
          error: null,
        }),
        updateUserById,
        createUser,
      },
    },
    from: (tabla: string) => {
      if (tabla === 'accounts') {
        return {
          select: (cols: string) =>
            cols === 'id'
              ? {
                  eq: (_c: string, v: string) => ({
                    maybeSingle: async () => ({
                      data: cuentas.find((c) => c.id === v) ?? null,
                      error: null,
                    }),
                  }),
                }
              : Promise.resolve({ data: cuentas, error: null }),
        };
      }
      return {
        select: () => ({
          eq: async (col: string, v: string) => ({
            data: perfiles.filter(
              (p) => (p as Record<string, string>)[col] === v
            ),
            error: null,
          }),
        }),
      };
    },
  };
  return { cliente, updateUserById, createUser };
}

describe('darSuperadmin', () => {
  it('crea el usuario con la marca en app_metadata e imprime una contraseña', async () => {
    const f = falso({});
    const r = await darSuperadmin(f.cliente, 'Juan@x.co', { cuenta: EMPRESA });
    expect(r.accion).toBe('creado');
    expect(r.contrasena).toMatch(/.{20,}/);
    expect(r.cuentaEmpresaId).toBe(EMPRESA);
    const arg = f.createUser.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg['app_metadata']).toEqual({ [MARCA]: true });
    expect(arg['password']).toBe(r.contrasena);
  });

  it('marca a un usuario existente conservando su app_metadata', async () => {
    const f = falso({
      usuarios: [
        { id: 'S', email: 'juan@x.co', app_metadata: { provider: 'email' } },
      ],
      perfiles: [{ user_id: 'S', account_id: PERSONAL }],
    });
    const r = await darSuperadmin(f.cliente, 'JUAN@x.co', { cuenta: EMPRESA });
    expect(r.accion).toBe('marcado');
    expect(f.updateUserById).toHaveBeenCalledWith('S', {
      app_metadata: { provider: 'email', [MARCA]: true },
    });
  });

  it('--quitar deja la marca en false', async () => {
    const f = falso({
      usuarios: [{ id: 'S', email: 'juan@x.co', app_metadata: { [MARCA]: true } }],
    });
    const r = await darSuperadmin(f.cliente, 'juan@x.co', { quitar: true });
    expect(r.accion).toBe('quitado');
    expect(f.updateUserById).toHaveBeenCalledWith('S', {
      app_metadata: { [MARCA]: false },
    });
  });

  it('--quitar sobre un correo inexistente no hace nada', async () => {
    const f = falso({});
    const r = await darSuperadmin(f.cliente, 'nadie@x.co', { quitar: true });
    expect(r.accion).toBe('sin-cambios');
    expect(f.updateUserById).not.toHaveBeenCalled();
  });

  it('se niega a marcar a un miembro de una cuenta con otros usuarios', async () => {
    const f = falso({
      usuarios: [{ id: 'AD', email: 'ad@x.co' }],
      perfiles: [
        { user_id: 'AD', account_id: PERSONAL },
        { user_id: 'OW', account_id: PERSONAL },
      ],
    });
    await expect(darSuperadmin(f.cliente, 'ad@x.co', { cuenta: EMPRESA })).rejects.toThrow(
      /otros usuarios/
    );
    expect(f.updateUserById).not.toHaveBeenCalled();
  });

  it('se niega a marcar al owner que es el único miembro de la cuenta de la empresa', async () => {
    const f = falso({
      usuarios: [{ id: 'OW', email: 'ow@x.co' }],
      cuentas: [{ id: EMPRESA, owner_user_id: 'OW' }],
      perfiles: [{ user_id: 'OW', account_id: EMPRESA }],
    });
    await expect(
      darSuperadmin(f.cliente, 'ow@x.co', { cuenta: EMPRESA })
    ).rejects.toThrow(/cuenta de la empresa/);
    expect(f.updateUserById).not.toHaveBeenCalled();
  });

  it('sin --cuenta ni EMPRESA_ACCOUNT_ID falla, aunque haya una sola candidata', async () => {
    const f = falso({ cuentas: [{ id: EMPRESA, owner_user_id: 'OW' }] });
    await expect(darSuperadmin(f.cliente, 'j@x.co')).rejects.toThrow(
      /falta la cuenta de la empresa/
    );
    expect(f.createUser).not.toHaveBeenCalled();
  });

  it('con una cuenta que no existe falla', async () => {
    const f = falso({ cuentas: [{ id: PERSONAL, owner_user_id: 'X' }] });
    await expect(
      darSuperadmin(f.cliente, 'j@x.co', { cuenta: EMPRESA })
    ).rejects.toThrow(/no existe/);
  });

  it('con varias cuentas y sin indicar cuál, pide --cuenta', async () => {
    const f = falso({
      cuentas: [
        { id: EMPRESA, owner_user_id: 'OW' },
        { id: PERSONAL, owner_user_id: 'X' },
      ],
    });
    await expect(darSuperadmin(f.cliente, 'j@x.co')).rejects.toThrow(/--cuenta/);
    expect(f.createUser).not.toHaveBeenCalled();
  });

  it('usa EMPRESA_ACCOUNT_ID del entorno si ya está', async () => {
    const f = falso({
      cuentas: [
        { id: EMPRESA, owner_user_id: 'OW' },
        { id: PERSONAL, owner_user_id: 'X' },
      ],
    });
    const r = await darSuperadmin(f.cliente, 'j@x.co', {
      env: { EMPRESA_ACCOUNT_ID: EMPRESA },
    });
    expect(r.cuentaEmpresaId).toBe(EMPRESA);
  });

  it('nunca escribe user_metadata', async () => {
    const f = falso({});
    await darSuperadmin(f.cliente, 'j@x.co', { cuenta: EMPRESA });
    expect(JSON.stringify(f.createUser.mock.calls)).not.toContain(
      'user_metadata'
    );
    const g = falso({ usuarios: [{ id: 'S', email: 'j@x.co' }] });
    await darSuperadmin(g.cliente, 'j@x.co', { cuenta: EMPRESA });
    expect(JSON.stringify(g.updateUserById.mock.calls)).not.toContain(
      'user_metadata'
    );
  });

  it('la marca del script es la misma que la del servidor', () => {
    expect(MARCA).toBe(MARCA_SUPERADMIN);
  });
});

describe('escribirVariableEnv', () => {
  it('reemplaza la línea existente y agrega si falta, sin tocar el resto', () => {
    const d = mkdtempSync(join(tmpdir(), 'superadmin-'));
    dirs.push(d);
    const f = join(d, '.env');
    writeFileSync(f, 'A=1\nEMPRESA_ACCOUNT_ID=\nB=2\n');
    escribirVariableEnv(f, 'EMPRESA_ACCOUNT_ID', EMPRESA);
    expect(readFileSync(f, 'utf8')).toBe(`A=1\nEMPRESA_ACCOUNT_ID=${EMPRESA}\nB=2\n`);
    writeFileSync(f, 'EMPRESA_ACCOUNT_ID=viejo\nA=1\nEMPRESA_ACCOUNT_ID=otro\n');
    escribirVariableEnv(f, 'EMPRESA_ACCOUNT_ID', EMPRESA);
    expect(readFileSync(f, 'utf8')).toBe(
      `EMPRESA_ACCOUNT_ID=viejo\nA=1\nEMPRESA_ACCOUNT_ID=${EMPRESA}\n`
    );
    writeFileSync(f, 'A=1\n');
    escribirVariableEnv(f, 'EMPRESA_ACCOUNT_ID', EMPRESA);
    expect(readFileSync(f, 'utf8')).toBe(`A=1\nEMPRESA_ACCOUNT_ID=${EMPRESA}\n`);
  });
});

describe('main', () => {
  it('sin --correo sale con 1', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await main([])).toBe(1);
    err.mockRestore();
  });

  it('por CLI sin --correo sale con 1', () => {
    const r = spawnSync(
      process.execPath,
      [join(__dirname, 'superadmin.mjs')],
      { encoding: 'utf8', timeout: 30_000 }
    );
    expect(r.status).toBe(1);
  });
});
