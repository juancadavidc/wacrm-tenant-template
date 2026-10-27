/**
 * Verificación del publicador de I2 (wacrm-permisos-granulares), cerrada por
 * USR.1. La prueba contra la base real es la IT de
 * src/lib/permisos/efectivos.it.test.ts (COMPOSE_IT=1); aquí, sin Docker, se
 * verifica la implementación con un lector falso y el SQL de la migración.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CUENTA_STUB,
  stubFuenteSecciones,
} from '@contracts/emp/company-sections.stub';
import {
  PERFILES_FABRICA,
  crearObtenerPermisosEfectivos,
  type LeerMiembro,
  type Miembro,
} from '@/lib/permisos/efectivos';
import {
  PermisosEfectivosSchema,
  recortarSecciones,
} from './effective-permissions';
import { IDS_STUB } from './effective-permissions.stub';

const CUENTA = CUENTA_STUB;
const USUARIO = IDS_STUB.asesor;

const SQL = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/permisos_002_perfiles.sql'),
  'utf8'
);

const miembroConPerfil = (nombre: string): Miembro => ({
  rolCuenta: 'agent',
  perfil: {
    id: IDS_STUB.perfilAsesor,
    nombre,
    secciones: [
      ...(PERFILES_FABRICA.find((p) => p.nombre === nombre)?.secciones ?? []),
    ],
  },
});

const con = (fuente = stubFuenteSecciones(), m: Miembro | null) => {
  const leer: LeerMiembro = async () => m;
  return crearObtenerPermisosEfectivos({ fuente, leer });
};
const q = { cuentaId: CUENTA, usuarioId: USUARIO };

describe('verificación del publicador de I2 (USR.1)', () => {
  it('devuelve permisos que pasan PermisosEfectivosSchema', async () => {
    const miembros: Miembro[] = [
      { rolCuenta: 'owner', perfil: null },
      { rolCuenta: 'admin', perfil: null },
      miembroConPerfil('Asesor'),
      { rolCuenta: 'agent', perfil: null },
    ];
    for (const m of miembros) {
      const p = await con(undefined, m)(q);
      expect(PermisosEfectivosSchema.safeParse(p).success).toBe(true);
    }
  });

  it('owner y admin reciben todo lo contratado y perfil null (R9, R11, R17)', async () => {
    const fuente = stubFuenteSecciones();
    fuente.apagar('agents');
    const contratadas = (await fuente.contratadas(CUENTA)).secciones;
    for (const rolCuenta of ['owner', 'admin'] as const) {
      const p = await con(fuente, { rolCuenta, perfil: null })(q);
      expect(p?.perfil).toBeNull();
      expect(p?.secciones).toEqual(contratadas);
    }
  });

  it('un usuario recibe su perfil recortado por lo contratado, igual que recortarSecciones (R7, R12)', async () => {
    const fuente = stubFuenteSecciones();
    fuente.apagar('agents');
    fuente.apagar('flows');
    const contratadas = (await fuente.contratadas(CUENTA)).secciones;
    for (const pf of PERFILES_FABRICA) {
      const p = await con(fuente, miembroConPerfil(pf.nombre))(q);
      expect(p?.secciones).toEqual(
        recortarSecciones({
          rol: 'usuario',
          seccionesPerfil: pf.secciones,
          contratadas,
        })
      );
    }
  });

  it('con Agentes de IA apagada, un usuario con perfil Marketing no recibe agents', async () => {
    const fuente = stubFuenteSecciones();
    fuente.apagar('agents');
    const p = await con(fuente, miembroConPerfil('Marketing'))(q);
    expect(p?.secciones).not.toContain('agents');
  });

  it('un invitado con rol usuario no tiene perfil ni secciones (R8)', async () => {
    const p = await con(undefined, { rolCuenta: 'agent', perfil: null })(q);
    expect(p).toMatchObject({ rol: 'usuario', perfil: null, secciones: [] });
  });

  it('tras la migración, un agente tiene perfil Asesor y un observador no tiene perfil', () => {
    const bloque = SQL.slice(SQL.indexOf("'usr1_usuarios_migrados'"));
    const insert = bloque.slice(
      bloque.indexOf('insert into permisos_perfil_usuario')
    );
    const fin = insert.indexOf(';');
    expect(insert.slice(0, fin)).toContain("pf.nombre = 'Asesor'");
    expect(insert.slice(0, fin)).toContain("p.account_role = 'agent'");
    expect(insert.slice(0, fin)).not.toContain('viewer');
  });

  it('un usuario que no es miembro de la cuenta devuelve null', async () => {
    expect(await con(undefined, null)(q)).toBeNull();
  });
});
