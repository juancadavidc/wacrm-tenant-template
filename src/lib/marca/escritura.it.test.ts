/**
 * IT de guardar y restaurar la marca (MRC.2) contra Postgres + Storage del
 * compose. Apagada por defecto: solo corre con COMPOSE_IT=1 (compose-it.yml).
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

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
  leerFilaMarca,
  TABLA_MARCA,
} from './base';
import { crearEscrituraMarca, type ArchivoSubido } from './escritura';
import { png } from './imagen.fixtures';
import { crearLeerMarca } from './marca';

// 8010 a 8015 los usan otras IT.
const PUERTO = '8016';
const SERVICIOS = SERVICE_NAMES.filter(
  (s) => s.startsWith('supabase-') && s !== 'supabase-studio'
);

const archivo = (bytes: Uint8Array, type = 'image/png'): ArchivoSubido => ({
  type,
  size: bytes.length,
  bytes: async () => bytes,
});

describe.skipIf(process.env['COMPOSE_IT'] !== '1')(
  'guardar y restaurar la marca contra Supabase',
  () => {
    let hijo: RepoHijo;
    let servicio: SupabaseClient;

    const compose = (...args: string[]) =>
      execFileSync('docker', ['compose', ...args], {
        cwd: hijo.dir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 20 * 1024 * 1024,
      });
    const dirConfig = () => join(hijo.dir, 'config');
    const escribirConfig = (conLogo: boolean) => {
      rmSync(dirConfig(), { recursive: true, force: true });
      mkdirSync(join(dirConfig(), 'marca'), { recursive: true });
      writeFileSync(
        join(dirConfig(), 'empresa.yaml'),
        'empresa:\n  id: marca-api-it\n  nombre: Marca API IT\n'
      );
      if (conLogo) {
        writeFileSync(
          join(dirConfig(), 'marca.yaml'),
          'marca:\n  logo: logo.png\n'
        );
        writeFileSync(join(dirConfig(), 'marca', 'logo.png'), 'LOGOCFG');
      }
    };

    // Caché real de la fila de MRC.1 (para probar "mismo proceso").
    const cache = crearCacheFila({ leer: () => leerFilaMarca(servicio) });
    const leerCacheada = () =>
      crearLeerMarca({ fila: () => cache.obtener(), dir: dirConfig })();
    const escritura = () =>
      crearEscrituraMarca({
        leerFila: () => leerFilaMarca(servicio),
        async guardarFila(cambios, userId) {
          const { error } = await servicio.from(TABLA_MARCA).upsert(
            {
              id: true,
              ...cambios,
              actualizado_en: new Date().toISOString(),
              actualizado_por: userId,
            },
            { onConflict: 'id' }
          );
          if (error) throw new Error(error.message);
        },
        async subir(ruta, bytes, tipo) {
          const { error } = await servicio.storage
            .from(BUCKET_MARCA)
            .upload(ruta, bytes, { contentType: tipo, upsert: true });
          if (error) throw new Error(error.message);
        },
        async borrar(rutas) {
          const { error } = await servicio.storage
            .from(BUCKET_MARCA)
            .remove(rutas);
          if (error) throw new Error(error.message);
        },
        invalidar: () => cache.invalidar(),
        leerMarca: leerCacheada,
      });
    const existe = async (ruta: string) =>
      !(await servicio.storage.from(BUCKET_MARCA).download(ruta)).error;
    // Una fila sin usuario: actualizado_por referencia auth.users.
    const USUARIO = null as unknown as string;

    beforeAll(async () => {
      hijo = crearRepoHijo({ id: 'marca-api-it', nombre: 'Marca API IT' });
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
      compose(
        'exec',
        '-T',
        'supabase-db',
        'psql',
        '-U',
        'postgres',
        '-d',
        'postgres',
        '-tAc',
        `notify pgrst, 'reload schema'`
      );
      const env = leerEnv(join(hijo.dir, '.env'));
      servicio = createClient(
        `http://127.0.0.1:${PUERTO}`,
        env['SUPABASE_SERVICE_ROLE_KEY']!,
        { auth: { persistSession: false } }
      );
      // PostgREST recarga el esquema de forma asíncrona tras el notify.
      for (let i = 0; i < 30; i++) {
        const { error } = await servicio.from(TABLA_MARCA).select('id');
        if (!error) break;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }, 900_000);

    afterAll(() => {
      if (!hijo) return;
      try {
        compose('down', '-v', '--remove-orphans');
      } finally {
        hijo.limpiar();
      }
    }, 300_000);

    it('un SVG con <script> y onload queda guardado sin ellos', async () => {
      escribirConfig(true);
      const svg = new TextEncoder().encode(
        '<svg xmlns="http://www.w3.org/2000/svg" onload="x()"><script>alert(1)</script><rect width="1" height="1"/></svg>'
      );
      const r = await escritura().guardar(
        { logo: archivo(svg, 'image/svg+xml') },
        USUARIO
      );
      expect(r.ok).toBe(true);
      const fila = await leerFilaMarca(servicio);
      const { data, error } = await servicio.storage
        .from(BUCKET_MARCA)
        .download(fila!.logo_ruta!);
      expect(error).toBeNull();
      const guardado = await data!.text();
      expect(guardado).not.toMatch(/script|onload/i);
      expect(guardado).toContain('<rect');
    }, 60_000);

    it('restaurar el logo vuelve a config/ y borra el archivo; sin config/, a Stackless', async () => {
      escribirConfig(true);
      const esc = escritura();
      await esc.guardar({ logo: archivo(png(8, 8)) }, USUARIO);
      const anterior = (await leerFilaMarca(servicio))!.logo_ruta!;
      expect(await existe(anterior)).toBe(true);
      const r = await esc.restaurar('logo', USUARIO);
      expect(r.fuentes.logo).toBe('config');
      expect(await existe(anterior)).toBe(false);

      escribirConfig(false);
      await esc.guardar({ logo: archivo(png(9, 9)) }, USUARIO);
      const otro = (await leerFilaMarca(servicio))!.logo_ruta!;
      const s = await esc.restaurar('logo', USUARIO);
      expect(s.fuentes.logo).toBe('defecto');
      expect(await existe(otro)).toBe(false);
    }, 60_000);

    it('después de guardar, leer devuelve el valor nuevo con fuente base en el mismo proceso', async () => {
      escribirConfig(true);
      await leerCacheada(); // llena la caché de 60 s
      const r = await escritura().guardar({ color: '#112233' }, USUARIO);
      expect(r.ok).toBe(true);
      const m = await leerCacheada();
      expect(m.color).toBe('#112233');
      expect(m.fuentes.color).toBe('base');
    }, 60_000);

    it('un valor inválido no cambia la fila', async () => {
      const antes = await leerFilaMarca(servicio);
      const r = await escritura().guardar({ color: 'red' }, USUARIO);
      expect(r).toMatchObject({ ok: false, campos: { color: 'formato' } });
      expect(await leerFilaMarca(servicio)).toEqual(antes);
    }, 60_000);
  }
);
