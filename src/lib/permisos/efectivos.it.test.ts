/**
 * IT de perfiles y permiso efectivo (USR.1) contra Postgres + PostgREST del
 * compose. Apagada por defecto: solo corre con COMPOSE_IT=1 (compose-it.yml).
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';

import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SERVICE_NAMES } from '../../../contracts/base/compose-services';
import {
  IDS_SECCION,
  type FuenteSecciones,
} from '../../../contracts/emp/company-sections';
import {
  CUENTA_STUB,
  stubFuenteSecciones,
} from '../../../contracts/emp/company-sections.stub';
import {
  crearRepoHijo,
  leerEnv,
  type RepoHijo,
} from '../../../scripts/empresa/repo-hijo';
import {
  PERFILES_FABRICA,
  crearObtenerPermisosEfectivos,
  leerMiembroSupabase,
} from './efectivos';

// 8010, 8011 y 8012 los usan otras IT (policies, asignación, secciones).
const PUERTO = '8013';
const SERVICIOS = SERVICE_NAMES.filter(
  (s) => s.startsWith('supabase-') && s !== 'supabase-studio'
);

const OWNER = '00000000-0000-4000-8000-0000000000a1';
const AGENTE = '00000000-0000-4000-8000-0000000000a2';
const OBSERVADOR = '00000000-0000-4000-8000-0000000000a3';
const INVITADO_USUARIO = '00000000-0000-4000-8000-0000000000a4';
const INVITADO_ADMIN = '00000000-0000-4000-8000-0000000000a5';
const OTRO_OWNER = '00000000-0000-4000-8000-0000000000b1';

describe.skipIf(process.env['COMPOSE_IT'] !== '1')(
  'perfiles y permiso efectivo contra Postgres',
  () => {
    let hijo: RepoHijo;
    let cuenta = '';
    let otraCuenta = '';
    const stub = stubFuenteSecciones();
    let obtener: ReturnType<typeof crearObtenerPermisosEfectivos>;

    const fuente: FuenteSecciones = {
      catalogo: stub.catalogo,
      contratadas: async (c) => ({
        ...(await stub.contratadas(CUENTA_STUB)),
        cuentaId: c,
      }),
    };

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
    const sql = (q: string) => psql(['-qtAc'], [q]);
    const usuarioNuevo = (id: string, email: string) =>
      sql(`insert into auth.users (id, email) values ('${id}','${email}')`);
    const invitar = (id: string, rol: 'agent' | 'admin') => {
      const hash = `hash-${id}`;
      usuarioNuevo(id, `${id}@perfiles.test`);
      sql(
        `insert into account_invitations (account_id, token_hash, role, expires_at) values ('${cuenta}','${hash}','${rol}', now() + interval '1 day')`
      );
      sql(`select redeem_invitation_for_new_user('${hash}','${id}')`);
    };
    const permisos = (usuarioId: string, cuentaId = cuenta) =>
      obtener({ cuentaId, usuarioId });
    const aplicar = (omitirPermisos: boolean) =>
      compose(
        'exec',
        '-T',
        'supabase-db',
        'sh',
        '-c',
        `for f in /migrations/*.sql; do case "$(basename "$f")" in permisos_*) [ ${omitirPermisos ? '1' : '0'} = 1 ] && continue ;; *) [ ${omitirPermisos ? '0' : '1'} = 1 ] && continue ;; esac; psql -v ON_ERROR_STOP=1 -U postgres -d postgres -f "$f" >/dev/null || exit 1; done`
      );

    beforeAll(async () => {
      hijo = crearRepoHijo({ id: 'perfiles-it', nombre: 'Perfiles IT' });
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
      // Base con datos ANTES de la migración de permisos.
      aplicar(true);
      usuarioNuevo(OWNER, 'owner@perfiles.test');
      usuarioNuevo(OTRO_OWNER, 'otro@perfiles.test');
      cuenta = sql(`select account_id from profiles where user_id='${OWNER}'`);
      otraCuenta = sql(
        `select account_id from profiles where user_id='${OTRO_OWNER}'`
      );
      usuarioNuevo(AGENTE, 'agente@perfiles.test');
      usuarioNuevo(OBSERVADOR, 'observador@perfiles.test');
      sql(
        `update profiles set account_id='${cuenta}', account_role='agent' where user_id='${AGENTE}'`
      );
      sql(
        `update profiles set account_id='${cuenta}', account_role='viewer' where user_id='${OBSERVADOR}'`
      );
      aplicar(false);
      sql(`notify pgrst, 'reload schema'`);

      const env = leerEnv(join(hijo.dir, '.env'));
      const cliente = createClient(
        `http://127.0.0.1:${PUERTO}`,
        env['SUPABASE_SERVICE_ROLE_KEY']!,
        { auth: { persistSession: false } }
      );
      obtener = crearObtenerPermisosEfectivos({
        fuente,
        leer: leerMiembroSupabase(cliente),
      });
      // PostgREST recarga el esquema de forma asíncrona tras el notify.
      for (let i = 0; i < 30; i++) {
        const { error } = await cliente.rpc('permisos_miembro', {
          p_account_id: cuenta,
          p_user_id: OWNER,
        });
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

    it('tras la migración, un agente tiene el perfil Asesor y un observador no tiene perfil', async () => {
      const a = await permisos(AGENTE);
      expect(a?.rol).toBe('usuario');
      expect(a?.perfil?.nombre).toBe('Asesor');
      expect(a?.secciones).toEqual(['inbox', 'contacts', 'pipelines']);
      const o = await permisos(OBSERVADOR);
      expect(o).toMatchObject({ rol: 'usuario', perfil: null, secciones: [] });
      const dueno = await permisos(OWNER);
      expect(dueno?.secciones).toEqual([...IDS_SECCION]);
      expect(dueno?.perfil).toBeNull();
      const perfiles = sql(
        `select nombre || ':' || array_to_string(secciones, ',') from permisos_perfiles where account_id='${cuenta}' and de_fabrica `
      ).split('\n');
      expect(perfiles.sort()).toEqual(
        PERFILES_FABRICA.map(
          (p) => `${p.nombre}:${p.secciones.join(',')}`
        ).sort()
      );
    }, 60_000);

    it('un usuario con perfil Marketing y Agentes de IA apagada no recibe Agentes de IA en su permiso efectivo', async () => {
      const marketing = sql(
        `select id from permisos_perfiles where account_id='${cuenta}' and nombre='Marketing'`
      );
      const asesor = sql(
        `select id from permisos_perfiles where account_id='${cuenta}' and nombre='Asesor'`
      );
      sql(
        `update permisos_perfil_usuario set perfil_id='${marketing}' where account_id='${cuenta}' and user_id='${AGENTE}'`
      );
      try {
        stub.apagar('agents');
        const sin = await permisos(AGENTE);
        expect(sin?.secciones).not.toContain('agents');
        expect(sin?.secciones).toContain('broadcasts');
        stub.prender('agents');
        expect((await permisos(AGENTE))?.secciones).toContain('agents');
      } finally {
        stub.prender('agents');
        sql(
          `update permisos_perfil_usuario set perfil_id='${asesor}' where account_id='${cuenta}' and user_id='${AGENTE}'`
        );
      }
    }, 60_000);

    it('un invitado con rol usuario no tiene secciones; uno invitado como admin tiene todo lo contratado', async () => {
      invitar(INVITADO_USUARIO, 'agent');
      invitar(INVITADO_ADMIN, 'admin');
      const u = await permisos(INVITADO_USUARIO);
      expect(u).toMatchObject({ rol: 'usuario', perfil: null, secciones: [] });
      const a = await permisos(INVITADO_ADMIN);
      expect(a).toMatchObject({ rol: 'admin', perfil: null });
      expect(a?.secciones).toEqual([...IDS_SECCION]);
    }, 60_000);

    it('re-aplicar la migración no asigna Asesor a un agente nuevo ni pisa perfiles editados', async () => {
      sql(
        `update permisos_perfiles set secciones='{inbox}' where account_id='${cuenta}' and nombre='Asesor'`
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
          '/migrations/permisos_002_perfiles.sql'
        );
        expect((await permisos(INVITADO_USUARIO))?.perfil).toBeNull();
        expect((await permisos(AGENTE))?.secciones).toEqual(['inbox']);
        expect(
          sql(
            `select count(*) from permisos_perfiles where account_id='${cuenta}'`
          )
        ).toBe('4');
      } finally {
        sql(
          `update permisos_perfiles set secciones='{inbox,contacts,pipelines}' where account_id='${cuenta}' and nombre='Asesor'`
        );
      }
    }, 60_000);

    it('quien sale de la cuenta pierde su perfil', async () => {
      expect(
        sql(
          `select count(*) from permisos_perfil_usuario where user_id='${AGENTE}'`
        )
      ).toBe('1');
      sql(
        `update profiles set account_id='${otraCuenta}' where user_id='${AGENTE}'`
      );
      expect(
        sql(
          `select count(*) from permisos_perfil_usuario where user_id='${AGENTE}'`
        )
      ).toBe('0');
      expect(await permisos(AGENTE)).toBeNull();
    }, 60_000);

    it('un usuario que no es miembro devuelve null', async () => {
      expect(await permisos('00000000-0000-4000-8000-0000000000ff')).toBeNull();
      expect(await permisos(OTRO_OWNER)).toBeNull();
    }, 60_000);
  }
);
