import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { TenantConfigSchema } from '../../contracts/cfg/tenant-config';
import { POLICIES_PATH } from './aplicar-policies.mjs';

const CLI = join(process.cwd(), 'scripts', 'empresa', 'aplicar-policies.mjs');
const dirs: string[] = [];

const ENV_OK =
  'NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9\nSUPABASE_SERVICE_ROLE_KEY=x\n';
const SIN_OWNER = `version: 1
usuarios:
  - { correo: a@b.co, nombre: A, rol: admin }
`;
const VALIDO = `version: 1
usuarios:
  - { correo: a@b.co, nombre: A, rol: owner }
`;

function hijo(policies: string | null, env: string) {
  const dir = mkdtempSync(join(tmpdir(), 'aplicar-policies-'));
  dirs.push(dir);
  if (policies !== null) {
    mkdirSync(join(dir, 'config'));
    writeFileSync(join(dir, 'config', 'policies.yaml'), policies);
  }
  writeFileSync(join(dir, '.env'), env);
  return dir;
}

function cli(dir: string) {
  return spawnSync(process.execPath, [CLI, '--dir', dir], {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'] ?? '' },
    timeout: 30_000,
  });
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('aplicar-policies (CLI)', () => {
  it('usa la ruta de policies del contrato CT.1', () => {
    expect(POLICIES_PATH).toBe(TenantConfigSchema.shape.policiesPath.parse(undefined));
  });

  it('con un policies.yaml inválido sale 1, nombra el campo y no toca la red', () => {
    const r = cli(hijo(SIN_OWNER, ENV_OK));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('usuarios');
    expect(r.stderr).not.toMatch(/fetch failed|ECONNREFUSED/);
  });

  it('sin config/policies.yaml sale 1 nombrando config/policies.yaml', () => {
    const r = cli(hijo(null, ENV_OK));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('config/policies.yaml');
  });

  it('sin SUPABASE_SERVICE_ROLE_KEY sale 1 nombrando la variable', () => {
    const r = cli(hijo(VALIDO, 'NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9\n'));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('con la base inalcanzable sale 3 diciendo que volver a correr es seguro', () => {
    const r = cli(hijo(VALIDO, ENV_OK));
    expect(r.status).toBe(3);
    expect(r.stderr).toContain('Volver a correr es seguro');
  }, 30_000);
});
