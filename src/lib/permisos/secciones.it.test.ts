/**
 * IT de las secciones contratadas (EMP.1) contra Postgres + PostgREST del compose.
 *
 * Apagada por defecto: solo corre con COMPOSE_IT=1 (workflow compose-it.yml).
 * Levanta la parte de Supabase de un repo hijo desechable.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';

import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SERVICE_NAMES } from '../../../contracts/base/compose-services';
import { IDS_SECCION } from '../../../contracts/emp/company-sections';
import {
  crearRepoHijo,
  leerEnv,
  type RepoHijo,
} from '../../../scripts/empresa/repo-hijo';
import { crearFuenteSecciones, leerContratadasSupabase } from './secciones';

// 8010 y 8011 los usan otras IT; 8012 está libre en el repo y en compose.
const PUERTO = '8012';
const SERVICIOS = SERVICE_NAMES.filter(
  (s) => s.startsWith('supabase-') && s !== 'supabase-studio'
);

const OWNER_A = '00000000-0000-4000-8000-0000000000a1';
const OWNER_B = '00000000-0000-4000-8000-0000000000b1';
const OWNER_C = '00000000-0000-4000-8000-0000000000c1';

describe.skipIf(process.env['COMPOSE_IT'] !== '1')(
  'secciones contratadas contra Postgres',
  () => {
    let hijo: RepoHijo;
    let cuentaA = '';
    let cuentaB = '';
    let fuente: ReturnType<typeof crearFuenteSecciones>;

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
    const sqlSilencioso = (q: string) => psql(['-qtAc'], [q]);
    const prendidas = async (cuenta: string) =>
      (await fuente.contratadas(cuenta)).secciones;

    beforeAll(() => {
      hijo = crearRepoHijo({ id: 'permisos-it', nombre: 'Permisos IT' });
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
      const aplicar = (omitir: 'permisos' | 'resto') =>
        compose(
          'exec',
          '-T',
          'supabase-db',
          'sh',
          '-c',
          `for f in /migrations/*.sql; do case "$(basename "$f")" in permisos_*) [ ${omitir === 'permisos' ? '1' : '0'} = 1 ] && continue ;; *) [ ${omitir === 'resto' ? '1' : '0'} = 1 ] && continue ;; esac; psql -v ON_ERROR_STOP=1 -U postgres -d postgres -f "$f" >/dev/null || exit 1; done`
        );
      // Base con datos ANTES de la migración de permisos.
      aplicar('permisos');
      for (const [i, u] of [OWNER_A, OWNER_B].entries()) {
        sql(
          `insert into auth.users (id, email) values ('${u}','u${i}@permisos.test')`
        );
      }
      cuentaA = sql(
        `select account_id from profiles where user_id='${OWNER_A}'`
      );
      cuentaB = sql(
        `select account_id from profiles where user_id='${OWNER_B}'`
      );
      sql(
        `insert into contacts (user_id, account_id, phone) values ('${OWNER_A}','${cuentaA}','+573000000001')`
      );
      aplicar('resto');
      sql(`notify pgrst, 'reload schema'`);

      const env = leerEnv(join(hijo.dir, '.env'));
      const cliente = createClient(
        `http://127.0.0.1:${PUERTO}`,
        env['SUPABASE_SERVICE_ROLE_KEY']!,
        { auth: { persistSession: false } }
      );
      fuente = crearFuenteSecciones(leerContratadasSupabase(cliente));
    }, 900_000);

    afterAll(() => {
      if (!hijo) return;
      try {
        compose('down', '-v', '--remove-orphans');
      } finally {
        hijo.limpiar();
      }
    }, 300_000);

    it('tras la migración en una base con datos, la empresa tiene las 10 secciones prendidas', async () => {
      expect(await prendidas(cuentaA)).toEqual([...IDS_SECCION]);
      expect(await prendidas(cuentaB)).toEqual([...IDS_SECCION]);
      expect(
        sql(
          "select array_to_string(array_agg(id order by orden), ',') from permisos_secciones"
        )
      ).toBe(IDS_SECCION.join(','));
      expect(sql('select count(*) from contacts')).toBe('1');
    }, 60_000);

    it('una sección agregada al catálogo después de la migración queda apagada', async () => {
      sql(`insert into permisos_secciones (id, orden) values ('reportes', 11)`);
      try {
        expect(
          sql(
            `select count(*) from permisos_secciones_cuenta where seccion_id='reportes' and prendida`
          )
        ).toBe('0');
        expect(await prendidas(cuentaA)).toEqual([...IDS_SECCION]);
        sql(
          `insert into auth.users (id, email) values ('${OWNER_C}','c@permisos.test')`
        );
        const cuentaC = sql(
          `select account_id from profiles where user_id='${OWNER_C}'`
        );
        expect(await prendidas(cuentaC)).toEqual([...IDS_SECCION]);
        expect(
          sql(
            `select count(*) from permisos_secciones_cuenta where account_id='${cuentaC}' and seccion_id='reportes'`
          )
        ).toBe('0');
      } finally {
        sql(`delete from permisos_secciones where id='reportes'`);
      }
    }, 60_000);

    it('apagar y prender una sección cambia lo que devuelve I1 sin reiniciar el servidor', async () => {
      const cambiar = (v: boolean) =>
        sql(
          `update permisos_secciones_cuenta set prendida=${v} where account_id='${cuentaA}' and seccion_id='agents'`
        );
      cambiar(false);
      expect(await prendidas(cuentaA)).not.toContain('agents');
      expect(await prendidas(cuentaB)).toContain('agents');
      cambiar(true);
      expect(await prendidas(cuentaA)).toEqual([...IDS_SECCION]);
    }, 60_000);

    it('re-aplicar la migración no vuelve a prender lo que se apagó', async () => {
      sql(
        `update permisos_secciones_cuenta set prendida=false where account_id='${cuentaA}' and seccion_id='flows'`
      );
      try {
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
          '/migrations/permisos_001_secciones.sql'
        );
        expect(await prendidas(cuentaA)).not.toContain('flows');
      } finally {
        sql(
          `update permisos_secciones_cuenta set prendida=true where account_id='${cuentaA}' and seccion_id='flows'`
        );
      }
    }, 60_000);

    it('un usuario de otra cuenta no ve el estado ajeno', () => {
      const ajeno = sqlSilencioso(
        `begin; set local role authenticated; select set_config('request.jwt.claims','{"sub":"${OWNER_B}","role":"authenticated"}',true); select count(*) from permisos_secciones_cuenta where account_id='${cuentaA}'; commit`
      );
      expect(ajeno.split('\n').at(-1)).toBe('0');
      const propio = sqlSilencioso(
        `begin; set local role authenticated; select set_config('request.jwt.claims','{"sub":"${OWNER_B}","role":"authenticated"}',true); select count(*) from permisos_secciones_cuenta where account_id='${cuentaB}'; commit`
      );
      expect(propio.split('\n').at(-1)).toBe('10');
    });
  }
);
