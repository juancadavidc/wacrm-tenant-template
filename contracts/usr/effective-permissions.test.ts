import { describe, expect, it } from 'vitest';
import {
  PermisosEfectivosSchema,
  puedeUsar,
  recortarSecciones,
  type PermisosEfectivos,
} from './effective-permissions';

const CUENTA = '11111111-1111-4111-8111-111111111111';
const USUARIO = '22222222-2222-4222-8222-222222222222';
const PERFIL = '33333333-3333-4333-8333-333333333333';

const base = {
  cuentaId: CUENTA,
  usuarioId: USUARIO,
  rol: 'owner',
  perfil: null,
  secciones: ['inbox'],
};

describe('recortarSecciones', () => {
  const contratadas = ['inbox', 'contacts', 'settings'];
  it.each(['owner', 'admin'] as const)(
    '%s recibe todas las contratadas',
    (rol) => {
      expect(
        recortarSecciones({ rol, seccionesPerfil: null, contratadas })
      ).toEqual(contratadas);
    }
  );
  it('admin ignora el perfil (R9/R17)', () => {
    expect(
      recortarSecciones({
        rol: 'admin',
        seccionesPerfil: ['agents'],
        contratadas,
      })
    ).toEqual(contratadas);
  });
  it('usuario: perfil recortado por lo contratado (R7)', () => {
    expect(
      recortarSecciones({
        rol: 'usuario',
        seccionesPerfil: ['inbox', 'contacts', 'pipelines', 'agents'],
        contratadas: ['inbox', 'contacts', 'pipelines'],
      })
    ).toEqual(['inbox', 'contacts', 'pipelines']);
  });
  it('usuario: respeta el orden de contratadas', () => {
    expect(
      recortarSecciones({
        rol: 'usuario',
        seccionesPerfil: ['agents', 'inbox'],
        contratadas: ['inbox', 'agents'],
      })
    ).toEqual(['inbox', 'agents']);
  });
  it('usuario sin perfil no recibe nada (R8)', () => {
    expect(
      recortarSecciones({ rol: 'usuario', seccionesPerfil: null, contratadas })
    ).toEqual([]);
  });
});

describe('PermisosEfectivosSchema', () => {
  it('acepta owner sin perfil', () => {
    expect(PermisosEfectivosSchema.safeParse(base).success).toBe(true);
  });
  it('acepta usuario con perfil', () => {
    const r = PermisosEfectivosSchema.safeParse({
      ...base,
      rol: 'usuario',
      perfil: { id: PERFIL, nombre: 'Asesor' },
    });
    expect(r.success).toBe(true);
  });
  it.each(['owner', 'admin'])('rechaza %s con perfil (R17)', (rol) => {
    const r = PermisosEfectivosSchema.safeParse({
      ...base,
      rol,
      perfil: { id: PERFIL, nombre: 'Asesor' },
    });
    expect(r.success).toBe(false);
  });
  it('rechaza usuario sin perfil con secciones (R8)', () => {
    expect(
      PermisosEfectivosSchema.safeParse({ ...base, rol: 'usuario' }).success
    ).toBe(false);
  });
  it.each([
    ['repetidos', { secciones: ['inbox', 'inbox'] }],
    ['con barra', { secciones: ['/settings'] }],
    ['mayúscula', { secciones: ['Settings'] }],
    ['rol agent', { rol: 'agent' }],
    ['rol superadmin', { rol: 'superadmin' }],
    ['cuentaId inválido', { cuentaId: 'x' }],
    ['llave extra', { seccion: 'inbox' }],
  ])('rechaza %s', (_n, cambio) => {
    expect(
      PermisosEfectivosSchema.safeParse({ ...base, ...cambio }).success
    ).toBe(false);
  });
});

describe('puedeUsar', () => {
  const p = PermisosEfectivosSchema.parse(base) as PermisosEfectivos;
  it('true si está en secciones, false si no', () => {
    expect(puedeUsar(p, 'inbox')).toBe(true);
    expect(puedeUsar(p, 'settings')).toBe(false);
  });
});
