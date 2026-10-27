import { describe, expect, it } from 'vitest';
import { rolDeCuenta, rolDeInvitacion } from './roles';

describe('rolDeCuenta', () => {
  it.each([
    ['owner', 'owner'],
    ['admin', 'admin'],
    ['agent', 'usuario'],
    ['viewer', 'usuario'],
  ] as const)('rolDeCuenta %s → %s', (entrada, esperado) => {
    expect(rolDeCuenta(entrada)).toBe(esperado);
  });
});

describe('rolDeInvitacion', () => {
  it.each([
    ['usuario', 'agent'],
    ['admin', 'admin'],
    ['agent', null],
    ['viewer', null],
    ['owner', null],
    ['superadmin', null],
    [undefined, null],
  ])('rolDeInvitacion %s → %s', (entrada, esperado) => {
    expect(rolDeInvitacion(entrada)).toBe(esperado);
  });
});
