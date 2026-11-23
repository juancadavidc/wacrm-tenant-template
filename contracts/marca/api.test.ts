import { describe, expect, it } from 'vitest';
import {
  ErrorSimpleSchema,
  ErrorValidacionSchema,
  ICONO_MAX_BYTES,
  LOGO_MAX_BYTES,
  MarcaApiSchema,
  RespuestaPutSchema,
  permiteEditarMarca,
  validarPut,
} from './api';

const marca = {
  marca: {
    nombre: 'Barú',
    color: '#2f7bf5',
    logoUrl: '/marca/logo?v=1',
    iconoUrl: '/marca/logo?v=1',
  },
  fuentes: {
    nombre: 'base',
    logo: 'config',
    icono: 'config',
    color: 'defecto',
  },
};

describe('validarPut', () => {
  it('sin campos', () => {
    expect(validarPut({})).toEqual({ ok: false, error: 'sin-campos' });
  });
  it('recorta el nombre', () => {
    const r = validarPut({ nombre: '  Barú  ' });
    expect(r).toEqual({ ok: true, valores: { nombre: 'Barú' } });
  });
  it('nombre vacío o muy largo', () => {
    for (const n of ['', '   ']) {
      expect(validarPut({ nombre: n })).toMatchObject({
        campos: { nombre: 'vacio' },
      });
    }
    expect(validarPut({ nombre: 'a'.repeat(61) })).toMatchObject({
      campos: { nombre: 'muy-largo' },
    });
    expect(validarPut({ nombre: 'a'.repeat(60) }).ok).toBe(true);
  });
  it('color', () => {
    expect(validarPut({ color: '#2f7bf5' }).ok).toBe(true);
    expect(validarPut({ color: '#2F7BF5' })).toEqual({
      ok: true,
      valores: { color: '#2F7BF5' },
    });
    for (const c of ['red', '#fff', '2f7bf5']) {
      expect(validarPut({ color: c })).toMatchObject({
        campos: { color: 'formato' },
      });
    }
  });
  it('logo', () => {
    expect(
      validarPut({ logo: { type: 'image/jpeg', size: 10 } })
    ).toMatchObject({ campos: { logo: 'tipo' } });
    expect(
      validarPut({ logo: { type: 'image/png', size: LOGO_MAX_BYTES + 1 } })
    ).toMatchObject({ campos: { logo: 'muy-pesado' } });
    for (const type of ['image/png', 'image/svg+xml', 'image/webp']) {
      expect(validarPut({ logo: { type, size: LOGO_MAX_BYTES } }).ok).toBe(
        true
      );
    }
  });
  it('ícono', () => {
    expect(
      validarPut({ icono: { type: 'image/webp', size: ICONO_MAX_BYTES + 1 } })
    ).toMatchObject({ campos: { icono: 'muy-pesado' } });
    expect(
      validarPut({ icono: { type: 'image/webp', size: ICONO_MAX_BYTES } }).ok
    ).toBe(true);
  });
  it('un campo inválido hace fallar todo, solo con su motivo', () => {
    const r = validarPut({
      color: '#2f7bf5',
      logo: { type: 'image/jpeg', size: 10 },
    });
    expect(r).toEqual({
      ok: false,
      error: 'validacion',
      campos: { logo: 'tipo' },
    });
  });
});

describe('permiteEditarMarca', () => {
  it('solo owner y superadmin', () => {
    expect(permiteEditarMarca('owner')).toBe(true);
    expect(permiteEditarMarca('superadmin')).toBe(true);
    expect(permiteEditarMarca('admin')).toBe(false);
    expect(permiteEditarMarca('usuario')).toBe(false);
  });
});

describe('esquemas', () => {
  it('MarcaApiSchema acepta y rechaza', () => {
    expect(MarcaApiSchema.safeParse(marca).success).toBe(true);
    const mal = (m: object) => MarcaApiSchema.safeParse(m).success;
    expect(mal({ ...marca, fuentes: { ...marca.fuentes, logo: 'ui' } })).toBe(
      false
    );
    expect(mal({ ...marca, marca: { ...marca.marca, color: 'red' } })).toBe(
      false
    );
    expect(
      mal({ ...marca, marca: { ...marca.marca, logoUrl: 'https://x/l.png' } })
    ).toBe(false);
    expect(
      mal({ ...marca, marca: { ...marca.marca, marcaUrl: '/marca/x' } })
    ).toBe(false);
  });
  it('RespuestaPutSchema avisos', () => {
    const ok = {
      ...marca,
      avisos: [{ campo: 'icono', aviso: 'no-cuadrado' }],
    };
    expect(RespuestaPutSchema.safeParse(ok).success).toBe(true);
    const mal = {
      ...marca,
      avisos: [{ campo: 'logo', aviso: 'no-cuadrado' }],
    };
    expect(RespuestaPutSchema.safeParse(mal).success).toBe(false);
  });
  it('errores', () => {
    const v = (campos: object) =>
      ErrorValidacionSchema.safeParse({ error: 'validacion', campos }).success;
    expect(v({})).toBe(false);
    expect(v({ color: 'tipo' })).toBe(false);
    expect(v({ logo: 'tipo' })).toBe(true);
    for (const error of [
      'sin-campos',
      'campo-invalido',
      'sin-permiso',
      'cuerpo-muy-pesado',
    ]) {
      expect(ErrorSimpleSchema.safeParse({ error }).success).toBe(true);
    }
  });
});
