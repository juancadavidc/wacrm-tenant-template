#!/usr/bin/env node
/**
 * Da o quita el superadmin de la instalación (EMP.2, R19) y deja escrita en
 * el .env la cuenta de la empresa (EMPRESA_ACCOUNT_ID).
 *
 * Uso (desde el checkout del repo hijo, con la base arriba):
 *   node scripts/empresa/superadmin.mjs --correo <c> [--cuenta <uuid> | --owner <correo>] [--quitar] [--dir <repo>]
 *
 * Códigos de salida: 0 hecho · 1 argumentos, configuración o regla incumplida.
 * Ver docs/superadmin.md.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { clienteServicio, leerEnvArchivo } from './aplicar-policies.mjs';

// Mismo literal que MARCA_SUPERADMIN (src/lib/permisos/marca-superadmin.ts); una prueba los compara.
export const MARCA = 'wacrm_superadmin';
export const VARIABLE_CUENTA = 'EMPRESA_ACCOUNT_ID';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ok({ data, error }, que) {
  if (error) throw new Error(`${que}: ${error.message}`);
  return data;
}

export async function buscarUsuario(cliente, correo) {
  const buscado = correo.toLowerCase();
  for (let page = 1; ; page++) {
    const { users } = ok(
      await cliente.auth.admin.listUsers({ page, perPage: 200 }),
      'listar usuarios'
    );
    const u = users.find((x) => (x.email ?? '').toLowerCase() === buscado);
    if (u) return u;
    if (users.length < 200) return null;
  }
}

/**
 * Cuenta de la empresa: --cuenta, o la que posee el correo de --owner, o
 * EMPRESA_ACCOUNT_ID (en ese orden), y tiene que existir. Nunca se deduce
 * sin que se diga cuál: cada miembro que se saca crea una cuenta personal, así
 * que "la única cuenta" o "la más antigua" no son confiables. Por eso --owner
 * exige que el correo posea exactamente una.
 */
export async function resolverCuentaEmpresa(
  cliente,
  { cuenta, owner, env = {} }
) {
  if (!cuenta && owner) return cuentaDelOwner(cliente, owner);
  const dicha = (cuenta ?? env[VARIABLE_CUENTA] ?? '').trim();
  if (!dicha) {
    throw new Error(
      `falta la cuenta de la empresa: pasa --cuenta <uuid> o --owner <correo>, o define ${VARIABLE_CUENTA} en el .env`
    );
  }
  if (!UUID.test(dicha)) {
    throw new Error(`${VARIABLE_CUENTA} no es un uuid: ${dicha}`);
  }
  const c = ok(
    await cliente.from('accounts').select('id').eq('id', dicha).maybeSingle(),
    'leer la cuenta'
  );
  if (!c) throw new Error(`la cuenta ${dicha} no existe en esta base`);
  return dicha;
}

async function cuentaDelOwner(cliente, correo) {
  const dueno = await buscarUsuario(cliente, correo);
  if (!dueno) throw new Error(`--owner: no existe el usuario ${correo}`);
  const cuentas =
    ok(
      await cliente.from('accounts').select('id').eq('owner_user_id', dueno.id),
      'leer las cuentas del owner'
    ) ?? [];
  if (cuentas.length === 0) {
    throw new Error(`--owner: ${correo} no es owner de ninguna cuenta`);
  }
  if (cuentas.length > 1) {
    throw new Error(
      `--owner: ${correo} es owner de ${cuentas.length} cuentas; pasa --cuenta <uuid>`
    );
  }
  return cuentas[0].id;
}

/** Escribe (o reemplaza) KEY=valor en el .env, sin tocar el resto. */
export function escribirVariableEnv(ruta, clave, valor) {
  const lineas = existsSync(ruta) ? readFileSync(ruta, 'utf8').split('\n') : [];
  const nueva = `${clave}=${valor}`;
  // la app lee la última línea de la variable: se reemplaza esa
  let i = -1;
  lineas.forEach((l, k) => {
    if (l.trim().startsWith(`${clave}=`)) i = k;
  });
  if (i >= 0) lineas[i] = nueva;
  else {
    if (lineas.length && lineas[lineas.length - 1] === '') lineas.pop();
    lineas.push(nueva, '');
  }
  writeFileSync(ruta, lineas.join('\n'));
}

/**
 * @param {any} cliente
 * @param {string} correo
 * @param {{ quitar?: boolean, cuenta?: string, owner?: string, env?: Record<string, string | undefined> }} [opciones]
 *
 * Da o quita la marca. Al marcar resuelve la cuenta de la empresa y la
 * devuelve en `cuentaEmpresaId` para que quien llama la deje en el .env.
 */
export async function darSuperadmin(
  cliente,
  correo,
  { quitar = false, cuenta, owner, env = {} } = {}
) {
  const usuario = await buscarUsuario(cliente, correo);
  if (quitar) {
    if (!usuario) return { accion: 'sin-cambios' };
    ok(
      await cliente.auth.admin.updateUserById(usuario.id, {
        app_metadata: { ...(usuario.app_metadata ?? {}), [MARCA]: false },
      }),
      'quitar la marca'
    );
    return { accion: 'quitado' };
  }

  const cuentaEmpresaId = await resolverCuentaEmpresa(cliente, {
    cuenta,
    owner,
    env,
  });

  if (!usuario) {
    const contrasena = randomBytes(18).toString('base64url');
    ok(
      await cliente.auth.admin.createUser({
        email: correo,
        email_confirm: true,
        password: contrasena,
        app_metadata: { [MARCA]: true },
      }),
      'crear el usuario'
    );
    return { accion: 'creado', contrasena, cuentaEmpresaId };
  }

  ok(
    await cliente.auth.admin.updateUserById(usuario.id, {
      app_metadata: { ...(usuario.app_metadata ?? {}), [MARCA]: true },
    }),
    'poner la marca'
  );
  return { accion: 'marcado', cuentaEmpresaId };
}

export async function main(argv) {
  let args;
  try {
    args = parseArgs({
      args: argv,
      options: {
        correo: { type: 'string' },
        cuenta: { type: 'string' },
        owner: { type: 'string' },
        quitar: { type: 'boolean', default: false },
        dir: { type: 'string' },
      },
    }).values;
  } catch (e) {
    console.error(e.message);
    return 1;
  }
  if (!args.correo) {
    console.error(
      'Uso: node scripts/empresa/superadmin.mjs --correo <c> [--cuenta <uuid> | --owner <correo>] [--quitar] [--dir <repo>]'
    );
    return 1;
  }
  if (args.cuenta && args.owner) {
    console.error('Pasa --cuenta o --owner, no los dos.');
    return 1;
  }
  const dir = resolve(args.dir ?? process.cwd());
  const envArchivo = join(dir, '.env');
  const env = { ...leerEnvArchivo(envArchivo), ...process.env };
  try {
    const cliente = clienteServicio(env);
    const r = await darSuperadmin(cliente, args.correo, {
      quitar: args.quitar,
      cuenta: args.cuenta,
      owner: args.owner,
      env,
    });
    console.log(`superadmin ${args.correo}: ${r.accion}`);
    if (r.contrasena) {
      console.log(
        `contraseña temporal (se muestra una sola vez): ${r.contrasena}`
      );
    }
    if (r.cuentaEmpresaId) {
      escribirVariableEnv(envArchivo, VARIABLE_CUENTA, r.cuentaEmpresaId);
      console.log(
        `${VARIABLE_CUENTA}=${r.cuentaEmpresaId} escrita en ${envArchivo}; recrea la app con 'docker compose up -d app' para que la lea`
      );
    }
    return 0;
  } catch (e) {
    console.error(e.message);
    return 1;
  }
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  process.exitCode = await main(process.argv.slice(2));
}
