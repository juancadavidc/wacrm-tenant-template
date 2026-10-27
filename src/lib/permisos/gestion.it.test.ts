/**
 * IT de gestión de perfiles y R21 (USR.2) contra Postgres + PostgREST del
 * compose. Apagada por defecto: solo corre con COMPOSE_IT=1 (compose-it.yml).
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';

import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SERVICE_NAMES } from '../../../contracts/base/compose-services';
import type { FuenteSecciones } from '../../../contracts/emp/company-sections';
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
  crearObtenerPermisosEfectivos,
  leerMiembroSupabase,
} from './efectivos';

// 8010 a 8013 los usan otras IT.
const PUERTO = '8014';
const SERVICIOS = SERVICE_NAMES.filter(
  (s) => s.startsWith('supabase-') && s !== 'supabase-studio'
);

const u = (n: number) => `00000000-0000-4000-8000-0000000000c${n}`;
const OWNER = u(1);
const ADMIN = u(2);
const ADMIN2 = u(3);
const ASESOR1 = u(4);
const ASESOR2 = u(5);
const USUARIO = u(6);
const OBSERVADOR = u(7);
const AJENO = '00000000-0000-4000-8000-0000000000d1';
const INVITADO = u(8);

describe.skipIf(process.env['COMPOSE_IT'] !== '1')(
  'gestión de perfiles y R21 contra Postgres',
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
    const miembro = (id: string, rol: string) => {
      usuarioNuevo(id, `${id}@gestion.test`);
      sql(
        `update profiles set account_id='${cuenta}', account_role='${rol}' where user_id='${id}'`
      );
    };
    const rolDe = (id: string) =>
      sql(`select account_role from profiles where user_id='${id}'`);
    const perfilId = (nombre: string, c = cuenta) =>
      sql(
        `select id from permisos_perfiles where account_id='${c}' and nombre='${nombre}'`
      );
    const permisos = (usuarioId: string) =>
      obtener({ cuentaId: cuenta, usuarioId });

    /** Corre `consulta` como `uid` autenticado (RLS y auth.uid() reales). */
    const comoUsuario = (uid: string, consulta: string) => {
      const script = `begin; select set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated"}', true); set local role authenticated; ${consulta}; commit;`;
      try {
        // Un solo -c con varios statements corre en una transacción implícita
        // distinta; por stdin se respeta el begin/commit explícito.
        execFileSync(
          'docker',
          [
            'compose',
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
            '-q',
          ],
          {
            cwd: hijo.dir,
            encoding: 'utf8',
            input: script,
            stdio: ['pipe', 'pipe', 'pipe'],
          }
        );
        return { ok: true, salida: '' };
      } catch (e) {
        const err = e as { stderr?: string };
        return { ok: false, salida: String(err.stderr ?? e) };
      }
    };

    const aplicar = () =>
      compose(
        'exec',
        '-T',
        'supabase-db',
        'sh',
        '-c',
        'for f in /migrations/*.sql; do psql -v ON_ERROR_STOP=1 -U postgres -d postgres -f "$f" >/dev/null || exit 1; done'
      );

    beforeAll(async () => {
      hijo = crearRepoHijo({
        id: 'gestion-perfiles-it',
        nombre: 'Gestion Perfiles IT',
      });
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
      aplicar();
      usuarioNuevo(OWNER, 'owner@gestion.test');
      usuarioNuevo(AJENO, 'ajeno@gestion.test');
      cuenta = sql(`select account_id from profiles where user_id='${OWNER}'`);
      otraCuenta = sql(
        `select account_id from profiles where user_id='${AJENO}'`
      );
      miembro(ADMIN, 'admin');
      miembro(ADMIN2, 'admin');
      miembro(ASESOR1, 'agent');
      miembro(ASESOR2, 'agent');
      miembro(USUARIO, 'agent');
      miembro(OBSERVADOR, 'viewer');
      for (const id of [ASESOR1, ASESOR2]) {
        sql(
          `insert into permisos_perfil_usuario (account_id, user_id, perfil_id) values ('${cuenta}','${id}','${perfilId('Asesor')}')`
        );
      }
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

    it('un admin no puede cambiar su propio perfil, ni el rol del owner ni el de otro admin', async () => {
      const propio = comoUsuario(
        ADMIN,
        `select permisos_asignar_perfil('${ADMIN}','${perfilId('Asesor')}')`
      );
      expect(propio.ok).toBe(false);
      expect(
        sql(
          `select count(*) from permisos_perfil_usuario where user_id='${ADMIN}'`
        )
      ).toBe('0');

      const alOwner = comoUsuario(
        ADMIN,
        `select set_member_role('${OWNER}','agent')`
      );
      expect(alOwner.ok).toBe(false);
      expect(rolDe(OWNER)).toBe('owner');

      const aOtroAdmin = comoUsuario(
        ADMIN,
        `select set_member_role('${ADMIN2}','agent')`
      );
      expect(aOtroAdmin.ok).toBe(false);
      expect(aOtroAdmin.salida).toMatch(/Solo el owner/);
      expect(rolDe(ADMIN2)).toBe('admin');

      expect(
        comoUsuario(ADMIN, `select set_member_role('${USUARIO}','admin')`).ok
      ).toBe(false);
      expect(rolDe(USUARIO)).toBe('agent');
      expect(
        comoUsuario(
          ADMIN,
          `insert into account_invitations (account_id, token_hash, role, expires_at) values ('${cuenta}','h-admin-por-admin','admin', now() + interval '1 day')`
        ).ok
      ).toBe(false);

      // Control: el owner sí puede.
      expect(
        comoUsuario(OWNER, `select set_member_role('${ADMIN2}','agent')`).ok
      ).toBe(true);
      expect(rolDe(ADMIN2)).toBe('agent');
      sql(`update profiles set account_role='admin' where user_id='${ADMIN2}'`);
    }, 120_000);

    it('el admin asigna el perfil Contestador y el permiso efectivo es solo lo del perfil', async () => {
      const r = comoUsuario(
        ADMIN,
        `select permisos_asignar_perfil('${USUARIO}','${perfilId('Contestador')}')`
      );
      expect(r.ok).toBe(true);
      const p = await permisos(USUARIO);
      expect(p?.perfil?.nombre).toBe('Contestador');
      expect(p?.secciones).toEqual(['inbox', 'notifications']);
    }, 60_000);

    it('agregar Agentes de IA al perfil Asesor llega a todos los asesores (R13)', async () => {
      const asesor = perfilId('Asesor');
      try {
        const r = comoUsuario(
          ADMIN,
          `select permisos_guardar_perfil('${asesor}','Asesor','{inbox,contacts,pipelines,agents}')`
        );
        expect(r.ok).toBe(true);
        for (const id of [ASESOR1, ASESOR2]) {
          expect((await permisos(id))?.secciones).toContain('agents');
        }
      } finally {
        sql(
          `update permisos_perfiles set secciones='{inbox,contacts,pipelines}' where id='${asesor}'`
        );
      }
    }, 60_000);

    it('un perfil que incluye una sección no contratada no la da a nadie', async () => {
      const r = comoUsuario(
        ADMIN,
        `select permisos_guardar_perfil(null,'Con flujos','{inbox,flows}')`
      );
      expect(r.ok).toBe(true);
      const id = perfilId('Con flujos');
      const anterior = perfilId('Contestador');
      try {
        sql(
          `update permisos_perfil_usuario set perfil_id='${id}' where user_id='${USUARIO}'`
        );
        stub.apagar('flows');
        expect((await permisos(USUARIO))?.secciones).toEqual(['inbox']);
      } finally {
        stub.prender('flows');
        sql(
          `update permisos_perfil_usuario set perfil_id='${anterior}' where user_id='${USUARIO}'`
        );
      }
    }, 60_000);

    it('asignar perfil a un ex-observador lo pasa a agent; quitarlo no cambia el rol', async () => {
      expect(
        comoUsuario(
          ADMIN,
          `select permisos_asignar_perfil('${OBSERVADOR}','${perfilId('Asesor')}')`
        ).ok
      ).toBe(true);
      expect(rolDe(OBSERVADOR)).toBe('agent');
      expect((await permisos(OBSERVADOR))?.perfil?.nombre).toBe('Asesor');
      expect(
        comoUsuario(
          ADMIN,
          `select permisos_asignar_perfil('${OBSERVADOR}', null)`
        ).ok
      ).toBe(true);
      expect(rolDe(OBSERVADOR)).toBe('agent');
      expect((await permisos(OBSERVADOR))?.perfil).toBeNull();
      // R17: a un admin no se le asigna perfil.
      expect(
        comoUsuario(
          OWNER,
          `select permisos_asignar_perfil('${ADMIN2}','${perfilId('Asesor')}')`
        ).ok
      ).toBe(false);
    }, 60_000);

    it('no se asigna un perfil de otra cuenta ni a un usuario de otra cuenta', () => {
      const ajeno = perfilId('Asesor', otraCuenta);
      expect(
        comoUsuario(
          ADMIN,
          `select permisos_asignar_perfil('${ASESOR1}','${ajeno}')`
        ).ok
      ).toBe(false);
      expect(
        comoUsuario(
          ADMIN,
          `select permisos_asignar_perfil('${AJENO}','${perfilId('Asesor')}')`
        ).ok
      ).toBe(false);
      expect(
        sql(
          `select count(*) from permisos_perfil_usuario where user_id='${AJENO}' or perfil_id='${ajeno}'`
        )
      ).toBe('0');
      // Editar un perfil de otra cuenta tampoco.
      expect(
        comoUsuario(
          ADMIN,
          `select permisos_guardar_perfil('${ajeno}','Asesor','{inbox}')`
        ).ok
      ).toBe(false);
    }, 60_000);

    it('un usuario normal no puede llamar las RPC de perfiles', () => {
      expect(
        comoUsuario(
          ASESOR1,
          `select permisos_guardar_perfil(null,'X','{inbox}')`
        ).ok
      ).toBe(false);
      expect(
        comoUsuario(
          ASESOR1,
          `select permisos_asignar_perfil('${USUARIO}','${perfilId('Asesor')}')`
        ).ok
      ).toBe(false);
      expect(
        sql(`select count(*) from permisos_perfiles where nombre='X'`)
      ).toBe('0');
    }, 60_000);

    it('transferir y canjear no chocan con R21', () => {
      usuarioNuevo(INVITADO, 'invitado@gestion.test');
      sql(
        `insert into account_invitations (account_id, token_hash, role, created_by_user_id, expires_at) values ('${cuenta}','h-admin-owner','admin','${OWNER}', now() + interval '1 day')`
      );
      sql(
        `select redeem_invitation_for_new_user('h-admin-owner','${INVITADO}')`
      );
      expect(rolDe(INVITADO)).toBe('admin');
      // Cada usuario nuevo trae su cuenta personal; sin ella el índice de un
      // dueño por cuenta impide la transferencia.
      sql(
        `delete from accounts where owner_user_id='${ADMIN}' and id<>'${cuenta}'`
      );

      expect(
        comoUsuario(OWNER, `select transfer_account_ownership('${ADMIN}')`).ok
      ).toBe(true);
      expect([rolDe(ADMIN), rolDe(OWNER)]).toEqual(['owner', 'admin']);
      expect(
        comoUsuario(ADMIN, `select transfer_account_ownership('${OWNER}')`).ok
      ).toBe(true);
      expect([rolDe(ADMIN), rolDe(OWNER)]).toEqual(['admin', 'owner']);
    }, 60_000);
  }
);
