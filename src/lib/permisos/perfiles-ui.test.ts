import { describe, expect, it } from 'vitest';
import {
  nombresDeSecciones,
  opcionesDeRol,
  puedeAsignarPerfil,
  puedeEditarRol,
} from './perfiles-ui';

describe('opcionesDeRol', () => {
  it.each([
    ['owner', ['usuario', 'admin']],
    ['admin', ['usuario']],
    ['agent', []],
    ['viewer', []],
  ] as const)('%s → %j', (rol, esperado) => {
    expect(opcionesDeRol(rol)).toEqual(esperado);
  });
});

describe('puedeEditarRol', () => {
  it('R21: al admin solo lo cambia el owner', () => {
    expect(puedeEditarRol('admin', 'admin', false)).toBe(false);
    expect(puedeEditarRol('owner', 'admin', false)).toBe(true);
  });
  it('nadie se cambia a sí mismo ni toca al owner', () => {
    for (const r of ['owner', 'admin', 'agent'] as const) {
      expect(puedeEditarRol(r, 'agent', true)).toBe(false);
      expect(puedeEditarRol(r, 'owner', false)).toBe(false);
    }
  });
  it('admin y owner cambian a un usuario; un usuario a nadie', () => {
    expect(puedeEditarRol('admin', 'agent', false)).toBe(true);
    expect(puedeEditarRol('agent', 'viewer', false)).toBe(false);
  });
});

describe('puedeAsignarPerfil', () => {
  it('admin asigna a un usuario', () => {
    expect(puedeAsignarPerfil('admin', 'viewer', false)).toBe(true);
  });
  it('no a un admin (R17), ni a uno mismo (R10), ni siendo usuario', () => {
    expect(puedeAsignarPerfil('admin', 'admin', false)).toBe(false);
    expect(puedeAsignarPerfil('admin', 'agent', true)).toBe(false);
    expect(puedeAsignarPerfil('agent', 'agent', false)).toBe(false);
  });
});

describe('nombresDeSecciones', () => {
  it('devuelve los nombres en el orden del catálogo e ignora desconocidos', () => {
    expect(nombresDeSecciones(['agents', 'inbox', 'reportes'])).toEqual([
      'Bandeja de entrada',
      'Agentes de IA',
    ]);
  });
});
