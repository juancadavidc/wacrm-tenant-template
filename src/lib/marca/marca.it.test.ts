/**
 * IT de la marca guardada (MRC.1) contra Postgres + PostgREST del compose.
 *
 * Apagada por defecto: solo corre con COMPOSE_IT=1 (workflow compose-it.yml).
 * Levanta la parte de Supabase de un repo hijo desechable.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { armarMarca } from '../../../contracts/marca/marca';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SERVICE_NAMES } from '../../../contracts/base/compose-services';
import {
  crearRepoHijo,
  leerEnv,
  type RepoHijo,
} from '../../../scripts/empresa/repo-hijo';
import {
  BUCKET_MARCA,
  crearCacheFila,
  descargarArchivoBase,
  leerFilaMarca,
} from './base';
import {
  crearArchivoMarca,
  crearLeerMarca,
  HEADERS_ARCHIVO_MARCA,
} from './marca';

// 8010 a 8014 los usan otras IT.
const PUERTO = '8015';
const SERVICIOS = SERVICE_NAMES.filter(
  (s) => s.startsWith('supabase-') && s !== 'supabase-studio'
);

describe.skipIf(process.env['COMPOSE_IT'] !== '1')(
  'marca contra Postgres',
  () => {
    let hijo: RepoHijo;
    let servicio: SupabaseClient;
    let anon: SupabaseClient;

    const compose = (...args: string[]) =>
      execFileSync('docker', ['compose', ...args], {
        cwd: hijo.dir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 20 * 1024 * 1024,
      });
    const psql = (flags: string[], arg: string[]) =>
      compose(
        'exec',
        '-T',
        'supabase-db',
        'psql',
        '-v',
        'ON_ERROR_STOP=1',
        '-U',
        'postgres',
        '-d',
        'postgres',
        ...flags,
        ...arg
      ).trim();
    const sql = (q: string) => psql(['-tAc'], [q]);

    beforeAll(async () => {
      hijo = crearRepoHijo({ id: 'marca-it', nombre: 'Marca IT' });
      appendFileSync(
        join(hijo.dir, '.env'),
        `\nKONG_HTTP_PORT=${PUERTO}\nNEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:${PUERTO}\n`
      );
      try {
        compose('up', '-d', '--wait', '--wait-timeout', '600', ...SERVICIOS);
      } catch (e) {
        console.error(compose('ps'));
        console.error(compose('logs', '--tail', '200'));
        throw e;
      }
      compose(
        'exec',
        '-T',
        'supabase-db',
        'sh',
        '-c',
        'for f in /migrations/*.sql; do psql -v ON_ERROR_STOP=1 -U postgres -d postgres -f "$f" >/dev/null || exit 1; done'
      );
      sql(`notify pgrst, 'reload schema'`);

      const env = leerEnv(join(hijo.dir, '.env'));
      const url = `http://127.0.0.1:${PUERTO}`;
      servicio = createClient(url, env['SUPABASE_SERVICE_ROLE_KEY']!, {
        auth: { persistSession: false },
      });
      anon = createClient(url, env['NEXT_PUBLIC_SUPABASE_ANON_KEY']!, {
        auth: { persistSession: false },
      });
      // PostgREST recarga el esquema de forma asíncrona tras el notify.
      for (let i = 0; i < 30; i++) {
        const { error } = await servicio.from('marca_instalacion').select('id');
        if (!error) break;
        await new Promise((r) => setTimeout(r, 1000));
      }
      sql(`insert into marca_instalacion (id, color) values (true, '#112233')`);
      const subida = await servicio.storage
        .from(BUCKET_MARCA)
        .upload('logo/x.png', new Uint8Array([137, 80, 78, 71]), {
          contentType: 'image/png',
          upsert: true,
        });
      expect(subida.error).toBeNull();
    }, 900_000);

    afterAll(() => {
      if (!hijo) return;
      try {
        compose('down', '-v', '--remove-orphans');
      } finally {
        hijo.limpiar();
      }
    }, 300_000);

    it('la migración es idempotente', () => {
      compose(
        'exec',
        '-T',
        'supabase-db',
        'psql',
        '-v',
        'ON_ERROR_STOP=1',
        '-U',
        'postgres',
        '-d',
        'postgres',
        '-f',
        '/migrations/marca_001_marca.sql'
      );
    }, 60_000);

    it('un cliente sin sesión no puede leer la tabla de marca', async () => {
      const { data, error } = await anon.from('marca_instalacion').select('*');
      expect(error?.code).toBe('42501');
      expect(data).toBeNull();
      const ok = await servicio.storage
        .from(BUCKET_MARCA)
        .download('logo/x.png');
      expect(ok.error).toBeNull();
      const descarga = await anon.storage
        .from(BUCKET_MARCA)
        .download('logo/x.png');
      expect(descarga.error).not.toBeNull();
    }, 60_000);

    it('el service role lee la fila', async () => {
      expect((await leerFilaMarca(servicio))?.color).toBe('#112233');
    }, 60_000);

    const dirConfig = () => join(hijo.dir, 'config');
    const escribirConfig = (archivos: Record<string, string>) => {
      rmSync(dirConfig(), { recursive: true, force: true });
      for (const [rel, c] of Object.entries(archivos)) {
        mkdirSync(join(dirConfig(), rel, '..'), { recursive: true });
        writeFileSync(join(dirConfig(), rel), c);
      }
    };
    const leerReal = (cliente: SupabaseClient = servicio) =>
      crearLeerMarca({
        fila: () => leerFilaMarca(cliente),
        dir: dirConfig,
      })();
    const archivosReales = () =>
      crearArchivoMarca({
        fila: () => leerFilaMarca(servicio),
        descargar: (r) => descargarArchivoBase(r, servicio),
        dir: dirConfig,
        stackless: () => new Uint8Array([9]),
      });

    it('con color en la base y logo y nombre en config/, toma el color de la base', async () => {
      escribirConfig({
        'empresa.yaml': 'empresa:\n  id: marca-it\n  nombre: Marca IT\n',
        'marca.yaml': 'marca:\n  logo: logo.png\n',
        'marca/logo.png': 'LOGO',
      });
      const m = await leerReal();
      expect(m.color).toBe('#112233');
      expect(m.fuentes.color).toBe('base');
      expect(m.nombre).toBe('Marca IT');
      expect(m.fuentes.nombre).toBe('config');
      expect(m.fuentes.logo).toBe('config');
    }, 60_000);

    it('rutas desde la base, desde config/ y sin nada', async () => {
      escribirConfig({
        'marca.yaml': 'marca:\n  logo: logo.png\n  icono: i.svg\n',
        'marca/logo.png': 'LOGOCFG',
        'marca/i.svg': '<svg/>',
      });
      const up = await servicio.storage
        .from(BUCKET_MARCA)
        .upload('icono/a.svg', new TextEncoder().encode('<svg id="base"/>'), {
          contentType: 'image/svg+xml',
          upsert: true,
        });
      expect(up.error).toBeNull();
      await servicio
        .from('marca_instalacion')
        .update({ icono_ruta: 'icono/a.svg', logo_ruta: 'logo/x.png' })
        .eq('id', true);

      const a = archivosReales();
      const icono = await a('icono');
      expect(new TextDecoder().decode(icono!.cuerpo)).toBe('<svg id="base"/>');
      expect(icono!.tipo).toBe('image/svg+xml');
      const res = new Response(icono!.cuerpo as BodyInit, {
        headers: { 'Content-Type': icono!.tipo, ...HEADERS_ARCHIVO_MARCA },
      });
      expect(res.headers.get('content-security-policy')).toContain('sandbox');
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect((await a('logo'))!.cuerpo.length).toBe(4);

      const antes = (await leerReal()).iconoUrl;
      await servicio
        .from('marca_instalacion')
        .update({ icono_ruta: 'icono/b.svg' })
        .eq('id', true);
      expect((await leerReal()).iconoUrl).not.toBe(antes);

      await servicio.from('marca_instalacion').delete().eq('id', true);
      expect(new TextDecoder().decode((await a('logo'))!.cuerpo)).toBe(
        'LOGOCFG'
      );
      expect(new TextDecoder().decode((await a('icono'))!.cuerpo)).toBe(
        '<svg/>'
      );

      escribirConfig({});
      expect(await a('icono')).toBeNull();
      expect(await leerReal()).toEqual(armarMarca({}));
    }, 60_000);

    it('con la base caída, la lectura cae sin lanzar', async () => {
      const caida = createClient('http://127.0.0.1:1', 'k', {
        auth: { persistSession: false },
      });
      const cache = crearCacheFila({ leer: () => leerFilaMarca(caida) });
      expect(await cache.obtener()).toBeNull();
    }, 60_000);

    it('con la base caída, la app sirve la marca de config/', async () => {
      escribirConfig({
        'empresa.yaml': 'empresa:\n  id: marca-it\n  nombre: Marca IT\n',
      });
      compose('stop', 'supabase-kong');
      const t0 = Date.now();
      const m = await leerReal(
        createClient(`http://127.0.0.1:${PUERTO}`, 'k', {
          auth: { persistSession: false },
          global: {
            fetch: (e, i) =>
              fetch(e, { ...i, signal: AbortSignal.timeout(2000) }),
          },
        })
      );
      expect(Date.now() - t0).toBeLessThan(3000);
      expect(m.fuentes.nombre).toBe('config');
      expect(m.fuentes.color).not.toBe('base');
    }, 60_000);
  }
);
