// Verificación del publicador de I1 (PRD wacrm-permisos-granulares), cerrada por EMP.1.
// La prueba de comportamiento contra la base real es la IT de
// src/lib/permisos/secciones.it.test.ts (COMPOSE_IT=1); aquí, sin Docker, se
// verifica el SQL de la migración y la fuente con un lector falso.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MIGRACION_WACRM } from '@contracts/mod/module';
import { crearFuenteSecciones } from '@/lib/permisos/secciones';
import { MIGRACION_PERMISOS } from '@/modulos/migraciones';
import {
  CATALOGO_V1,
  IDS_SECCION,
  SeccionesContratadasSchema,
} from './company-sections';

const DIR = path.join(process.cwd(), 'supabase/migrations');
const SQL = fs.readFileSync(
  path.join(DIR, 'permisos_001_secciones.sql'),
  'utf8'
);
const UUID = '11111111-1111-4111-8111-111111111111';

/** Filas `('<id>', <orden>, <bool>)` de la siembra (formato fijo, una por línea). */
function siembra(): { id: string; orden: number; defecto: boolean }[] {
  return [
    ...SQL.matchAll(/^\s*\('([a-z-]+)', (\d+), (true|false)\)[,;]?$/gm),
  ].map((m) => ({
    id: m[1]!,
    orden: Number(m[2]),
    defecto: m[3] === 'true',
  }));
}

describe('verificación del publicador de I1 · secciones (EMP.1)', () => {
  it('la fuente real implementa FuenteSecciones y su catálogo es igual a CATALOGO_V1', async () => {
    const fuente = crearFuenteSecciones(async () => []);
    expect(await fuente.catalogo()).toBe(CATALOGO_V1);
  });

  it('contratadas() devuelve un valor que pasa SeccionesContratadasSchema', async () => {
    const fuente = crearFuenteSecciones(async () => ['inbox', 'agents']);
    const r = await fuente.contratadas(UUID);
    expect(SeccionesContratadasSchema.safeParse(r).success).toBe(true);
  });

  it('tras la migración en una base con datos, la empresa tiene las 10 secciones prendidas (R20)', () => {
    // Comportamiento real: IT "tras la migración en una base con datos…".
    const filas = siembra();
    expect(filas.map((f) => f.id)).toEqual([...IDS_SECCION]);
    expect(filas.every((f) => f.defecto)).toBe(true);
    expect(filas.map((f) => f.orden)).toEqual(IDS_SECCION.map((_, i) => i + 1));
    expect(SQL).toMatch(
      /insert into permisos_secciones_cuenta[\s\S]*from accounts a[\s\S]*where s\.prendida_por_defecto[\s\S]*on conflict do nothing/
    );
  });

  it('una sección agregada al catálogo después de la migración queda apagada (R5)', async () => {
    expect(SQL).toMatch(/prendida_por_defecto boolean not null default false/);
    expect(SQL).toMatch(
      /permisos_secciones_cuenta_nueva\(\)[\s\S]*where s\.prendida_por_defecto/
    );
    const fuente = crearFuenteSecciones(async () => [
      'reportes',
      ...IDS_SECCION,
    ]);
    expect((await fuente.contratadas(UUID)).secciones).not.toContain(
      'reportes'
    );
  });

  it('apagar y prender una sección cambia contratadas() sin reiniciar el servidor (R3)', async () => {
    let estado: string[] = [...IDS_SECCION];
    const fuente = crearFuenteSecciones(async () => estado);
    expect((await fuente.contratadas(UUID)).secciones).toContain('agents');
    estado = estado.filter((s) => s !== 'agents');
    expect((await fuente.contratadas(UUID)).secciones).not.toContain('agents');
    estado = [...IDS_SECCION];
    expect((await fuente.contratadas(UUID)).secciones).toContain('agents');
  });

  it('las migraciones de EMP.1 llevan prefijo propio y no tocan las de wacrm', () => {
    const archivos = fs.readdirSync(DIR).filter((f) => f.endsWith('.sql'));
    const crean = archivos.filter((f) =>
      /\bpermisos_[a-z]/i.test(fs.readFileSync(path.join(DIR, f), 'utf8'))
    );
    expect(crean.length).toBeGreaterThan(0);
    for (const f of crean) {
      expect(MIGRACION_PERMISOS.test(f), f).toBe(true);
      expect(MIGRACION_WACRM.test(f), f).toBe(false);
    }
  });
});
