import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  definirModulo,
  esMigracionDeModulo,
  MIGRACION_WACRM,
  ordenMigraciones,
} from '@contracts/mod/module';
import {
  DIR_MIGRACIONES,
  MIGRACION_PERMISOS,
  verificarMigraciones,
} from './migraciones';
import { MODULOS } from './registro';

const reales = fs
  .readdirSync(DIR_MIGRACIONES)
  .filter((f) => f.endsWith('.sql'));

const demo = (migraciones: string[] = []) =>
  definirModulo({
    nombre: 'demo',
    configSchema: z.object({}),
    migraciones,
  });

describe('migraciones de módulos (IT estática)', () => {
  it('las migraciones del repo no tienen problemas con el registro actual', () => {
    expect(verificarMigraciones(reales, MODULOS)).toEqual([]);
  });

  it('ninguna migración de wacrm crea objetos con prefijo mod_ (no chocan)', () => {
    for (const f of reales.filter((f) => MIGRACION_WACRM.test(f))) {
      const sql = fs.readFileSync(path.join(DIR_MIGRACIONES, f), 'utf8');
      expect(sql, f).not.toMatch(/\bmod_[a-z][a-z0-9]*_/i);
    }
  });

  it('con un módulo agregado, las suyas quedan después de todas las de wacrm', () => {
    const todas = ordenMigraciones([
      ...reales.filter((f) => MIGRACION_WACRM.test(f)),
      'mod_demo_001.sql',
      'mod_demo_002_x.sql',
    ]);
    const ultimaWacrm = todas.findLastIndex((f) => MIGRACION_WACRM.test(f));
    expect(todas.slice(ultimaWacrm + 1)).toEqual([
      'mod_demo_001.sql',
      'mod_demo_002_x.sql',
    ]);
  });

  it('el glob del contenedor (orden C) coincide con ordenMigraciones', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-'));
    try {
      const todas = [...reales, 'mod_demo_001.sql'];
      for (const f of todas) fs.writeFileSync(path.join(dir, f), '');
      const glob = execFileSync(
        'sh',
        ['-c', 'LC_ALL=C; for f in *.sql; do echo "$f"; done'],
        { cwd: dir, encoding: 'utf8' }
      )
        .trim()
        .split('\n');
      expect(glob).toEqual(ordenMigraciones(todas));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('señala una mod_*.sql sin módulo registrado', () => {
    expect(
      verificarMigraciones(['001_a.sql', 'mod_fantasma_001.sql'], [])
    ).toEqual([
      {
        archivo: 'mod_fantasma_001.sql',
        motivo: expect.stringMatching(/no registrado/),
      },
    ]);
  });

  it('señala un archivo que no es de wacrm ni de módulo', () => {
    expect(verificarMigraciones(['Foo.sql'], [])).toEqual([
      { archivo: 'Foo.sql', motivo: expect.stringMatching(/ni migración/) },
    ]);
  });

  it('señala una migración declarada que no está en la carpeta', () => {
    expect(verificarMigraciones([], [demo(['mod_demo_001.sql'])])).toEqual([
      {
        archivo: 'mod_demo_001.sql',
        motivo: expect.stringMatching(/ausente/),
      },
    ]);
  });

  it('la migración de prueba de CI tiene nombre de módulo', () => {
    expect(esMigracionDeModulo('mod_demo_001.sql', 'demo')).toBe(true);
    expect(fs.existsSync('supabase/ci/modulos/mod_demo_001.sql')).toBe(true);
  });

  it('acepta las migraciones del núcleo de permisos', () => {
    expect(
      verificarMigraciones(['001_a.sql', 'permisos_001_secciones.sql'], [])
    ).toEqual([]);
  });

  it('rechaza un prefijo permisos_ mal formado', () => {
    const p = verificarMigraciones(['permisos_1_x.sql'], []);
    expect(p).toHaveLength(1);
    expect(p[0].motivo).toMatch(/ni migración de wacrm ni de módulo/);
  });

  it('las de permisos van después de las de wacrm y de módulos', () => {
    const todas = ordenMigraciones([...reales, 'mod_demo_001.sql']);
    expect(todas.slice(-3)).toEqual([
      'permisos_001_secciones.sql',
      'permisos_002_perfiles.sql',
      'permisos_003_gestion_perfiles.sql',
    ]);
    const primera = todas.findIndex((f) => MIGRACION_PERMISOS.test(f));
    expect(todas.slice(primera).every((f) => MIGRACION_PERMISOS.test(f))).toBe(
      true
    );
  });

  it('ninguna migración de wacrm ni de módulo crea objetos permisos_', () => {
    for (const f of reales.filter((f) => !MIGRACION_PERMISOS.test(f))) {
      const sql = fs.readFileSync(path.join(DIR_MIGRACIONES, f), 'utf8');
      expect(sql, f).not.toMatch(/\bpermisos_[a-z]/i);
    }
  });
});
