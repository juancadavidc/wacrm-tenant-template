import { describe, expect, it } from 'vitest';
import { IdSeccionSchema, PerfilRefSchema } from './effective-permissions';
import {
  IDS_STUB,
  PERFILES_STUB,
  SECCIONES_STUB,
  stubObtenerPermisos,
  stubPermisos,
} from './effective-permissions.stub';

describe('stub de I2', () => {
  it('owner recibe todo y no tiene perfil', () => {
    const p = stubPermisos({ rol: 'owner' });
    expect(p.secciones).toEqual(SECCIONES_STUB);
    expect(p.perfil).toBeNull();
  });
  it('usuario con perfil asesor', () => {
    expect(
      stubPermisos({ rol: 'usuario', perfil: 'asesor' }).perfil?.nombre
    ).toBe('Asesor');
  });
  it('usuario sin perfil no tiene secciones', () => {
    expect(stubPermisos({ rol: 'usuario' }).secciones).toEqual([]);
  });
  it('admin con perfil lanza (R17)', () => {
    expect(() => stubPermisos({ rol: 'admin', perfil: 'asesor' })).toThrow();
  });
  it('cuentaId inválido lanza', () => {
    expect(() =>
      stubPermisos({ rol: 'usuario', perfil: 'asesor', cuentaId: 'x' })
    ).toThrow();
  });
  it('los perfiles de fábrica cumplen el contrato', () => {
    for (const { ref, secciones } of Object.values(PERFILES_STUB)) {
      expect(PerfilRefSchema.safeParse(ref).success).toBe(true);
      for (const s of secciones) {
        expect(IdSeccionSchema.safeParse(s).success).toBe(true);
      }
    }
  });
  it('obtener devuelve el permiso o null', async () => {
    const p = stubPermisos({ rol: 'owner' });
    const obtener = stubObtenerPermisos([p]);
    expect(
      await obtener({ cuentaId: p.cuentaId, usuarioId: p.usuarioId })
    ).toBe(p);
    expect(
      await obtener({ cuentaId: IDS_STUB.otraCuenta, usuarioId: p.usuarioId })
    ).toBeNull();
  });
});
