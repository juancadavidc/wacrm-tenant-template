import { describe, expect, it } from 'vitest';
import { puedeUsar } from './effective-permissions';
import {
  IDS_STUB,
  SECCIONES_STUB,
  stubObtenerPermisos,
  stubPermisos,
} from './effective-permissions.stub';

describe('CDC SRV.2 · permisos efectivos', () => {
  it('Contestador usa inbox y notifications, no settings', () => {
    const p = stubPermisos({ rol: 'usuario', perfil: 'contestador' });
    expect(puedeUsar(p, 'inbox')).toBe(true);
    expect(puedeUsar(p, 'notifications')).toBe(true);
    expect(puedeUsar(p, 'settings')).toBe(false);
  });
  it('Marketing con todo contratado: todo menos settings', () => {
    const p = stubPermisos({ rol: 'usuario', perfil: 'marketing' });
    expect(p.secciones).toEqual(SECCIONES_STUB.filter((s) => s !== 'settings'));
  });
  it('Marketing sin agents contratada no ve agents (R7)', () => {
    const p = stubPermisos({
      rol: 'usuario',
      perfil: 'marketing',
      contratadas: SECCIONES_STUB.filter((s) => s !== 'agents'),
    });
    expect(puedeUsar(p, 'agents')).toBe(false);
  });
  it('Asesor con Agentes IA ve agents; Asesor no', () => {
    expect(
      puedeUsar(stubPermisos({ rol: 'usuario', perfil: 'asesorIa' }), 'agents')
    ).toBe(true);
    expect(
      puedeUsar(stubPermisos({ rol: 'usuario', perfil: 'asesor' }), 'agents')
    ).toBe(false);
  });
  it('usuario sin perfil no usa nada', () => {
    const p = stubPermisos({ rol: 'usuario' });
    expect(SECCIONES_STUB.every((s) => !puedeUsar(p, s))).toBe(true);
  });
  it.each(['owner', 'admin'] as const)(
    '%s usa lo contratado y nada más',
    (rol) => {
      const p = stubPermisos({ rol, contratadas: ['inbox'] });
      expect(puedeUsar(p, 'inbox')).toBe(true);
      expect(puedeUsar(p, 'agents')).toBe(false);
    }
  );
  it('no miembro de la cuenta: null, tratado como sin acceso', async () => {
    const p = stubPermisos({ rol: 'owner' });
    const obtener = stubObtenerPermisos([p]);
    const r = await obtener({
      cuentaId: IDS_STUB.otraCuenta,
      usuarioId: p.usuarioId,
    });
    expect(r === null || !puedeUsar(r, 'inbox')).toBe(true);
    expect(r).toBeNull();
  });
});
