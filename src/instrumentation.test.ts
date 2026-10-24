import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fijarFlujoEntrada } from '@/modulos/arranque';
import { register } from './instrumentation';

vi.mock('@/modulos/registro', async () => {
  const { z } = await import('zod');
  const { definirModulo } = await import('@contracts/mod/module');
  return {
    MODULOS: [
      definirModulo({
        nombre: 'demo',
        configSchema: z.strictObject({ limite: z.number().int().positive() }),
        migraciones: [],
      }),
    ],
  };
});

const dirs: string[] = [];
const dirVacio = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'instr-'));
  dirs.push(d);
  return d;
};
const conYaml = (t: string) => {
  const d = dirVacio();
  fs.writeFileSync(path.join(d, 'modules.yaml'), t);
  return d;
};

beforeEach(() => {
  vi.stubEnv('NEXT_RUNTIME', 'nodejs');
  fijarFlujoEntrada(undefined);
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  fijarFlujoEntrada(undefined);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  for (const d of dirs.splice(0))
    fs.rmSync(d, { recursive: true, force: true });
});

describe('register (arranque)', () => {
  it('config válida: arranca', async () => {
    vi.stubEnv(
      'CONFIG_EMPRESA_DIR',
      conYaml(
        'modulos:\n  demo:\n    activo: true\n    config:\n      limite: 2\n'
      )
    );
    await expect(register()).resolves.toBeUndefined();
  });
  it('config de módulo inválida: el arranque falla (R18)', async () => {
    vi.stubEnv(
      'CONFIG_EMPRESA_DIR',
      conYaml(
        'modulos:\n  demo:\n    activo: true\n    config:\n      limite: 0\n'
      )
    );
    await expect(register()).rejects.toThrow(/config inválida del módulo demo/);
  });
  it('módulo encendido que no existe: el arranque falla', async () => {
    vi.stubEnv(
      'CONFIG_EMPRESA_DIR',
      conYaml('modulos:\n  asignacoin:\n    activo: true\n')
    );
    await expect(register()).rejects.toThrow(/asignacoin/);
  });
  it('modules.yaml con forma inválida: el arranque falla', async () => {
    vi.stubEnv(
      'CONFIG_EMPRESA_DIR',
      conYaml('modulos:\n  demo:\n    activa: true\n')
    );
    await expect(register()).rejects.toThrow(/modules\.yaml/);
  });
  it('sin config/: arranca con todo apagado', async () => {
    vi.stubEnv('CONFIG_EMPRESA_DIR', dirVacio());
    await expect(register()).resolves.toBeUndefined();
  });
  it('en el runtime edge no hace nada', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'edge');
    vi.stubEnv(
      'CONFIG_EMPRESA_DIR',
      conYaml(
        'modulos:\n  demo:\n    activo: true\n    config:\n      limite: 0\n'
      )
    );
    await expect(register()).resolves.toBeUndefined();
  });
});
