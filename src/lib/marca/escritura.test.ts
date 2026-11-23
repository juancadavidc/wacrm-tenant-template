import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MarcaApiSchema, validarPut } from '@contracts/marca/api';
import { afterEach, describe, expect, it } from 'vitest';
import {
  aMarcaApi,
  crearEscrituraMarca,
  type ArchivoSubido,
  type EntradaGuardar,
} from './escritura';
import { crearMarcaFalsa } from './escritura.fake';
import { png } from './imagen.fixtures';

const dirs: string[] = [];
function conConfig(logo = true, nombre = 'Empresa Config'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'marca-esc-'));
  dirs.push(dir);
  fs.writeFileSync(
    path.join(dir, 'empresa.yaml'),
    `empresa:\n  id: e\n  nombre: "${nombre}"\n`
  );
  if (logo) {
    fs.writeFileSync(
      path.join(dir, 'marca.yaml'),
      'marca:\n  logo: logo.png\n'
    );
    fs.mkdirSync(path.join(dir, 'marca'));
    fs.writeFileSync(path.join(dir, 'marca', 'logo.png'), 'LOGOCFG');
  }
  return dir;
}
afterEach(() => {
  while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true });
});

const enc = (s: string) => new TextEncoder().encode(s);
const archivo = (
  bytes: Uint8Array,
  type = 'image/png',
  size = bytes.length
): ArchivoSubido => ({ type, size, bytes: async () => bytes });
const pesado = (n: number, type = 'image/png'): ArchivoSubido => ({
  type,
  size: n,
  bytes: async () => new Uint8Array(n),
});
const USER = 'u1';

function montar(o: Parameters<typeof crearMarcaFalsa>[0] = {}) {
  const f = crearMarcaFalsa({ dirConfig: conConfig(), ...o });
  return { f, esc: crearEscrituraMarca(f.deps) };
}

describe('guardar', () => {
  it('color: fila, marca y fuente base; invalida una vez', async () => {
    const { f, esc } = montar();
    const r = await esc.guardar({ color: '#112233' }, USER);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(f.fila()?.color).toBe('#112233');
    expect(r.marca.marca.color).toBe('#112233');
    expect(r.marca.fuentes.color).toBe('base');
    expect(f.invalidaciones()).toBe(1);
    expect(f.fila()?.actualizado_por).toBe(USER);
  });

  it('logo PNG: ruta con hash, archivo en el storage y URL con versión', async () => {
    const { f, esc } = montar();
    const r = await esc.guardar({ logo: archivo(png(8, 8)) }, USER);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(f.fila()?.logo_ruta).toMatch(/^logo\/[0-9a-f]{16}\.png$/);
    expect(f.archivos().has(f.fila()!.logo_ruta!)).toBe(true);
    expect(r.marca.fuentes.logo).toBe('base');
    expect(r.marca.marca.logoUrl).toMatch(/^\/marca\/logo\?v=/);
  });

  it('reemplazar el logo borra el anterior; el mismo archivo dos veces conserva la ruta', async () => {
    const { f, esc } = montar();
    await esc.guardar({ logo: archivo(png(8, 8)) }, USER);
    const primera = f.fila()!.logo_ruta!;
    await esc.guardar({ logo: archivo(png(8, 8)) }, USER);
    expect(f.fila()!.logo_ruta).toBe(primera);
    expect(f.archivos().has(primera)).toBe(true);
    await esc.guardar({ logo: archivo(png(9, 9)) }, USER);
    expect(f.fila()!.logo_ruta).not.toBe(primera);
    expect(f.archivos().has(primera)).toBe(false);
    expect(f.archivos().size).toBe(1);
  });

  const rechazos: [string, EntradaGuardar, Record<string, string>][] = [
    [
      'jpg',
      { logo: archivo(new Uint8Array(10), 'image/jpeg') },
      { logo: 'tipo' },
    ],
    ['logo pesado', { logo: pesado(1024 * 1024 + 1) }, { logo: 'muy-pesado' }],
    [
      'ícono pesado',
      { icono: pesado(512 * 1024 + 1) },
      { icono: 'muy-pesado' },
    ],
    ['color red', { color: 'red' }, { color: 'formato' }],
    ['nombre vacío', { nombre: '' }, { nombre: 'vacio' }],
    ['nombre de 61', { nombre: 'a'.repeat(61) }, { nombre: 'muy-largo' }],
  ];
  it.each(rechazos)(
    'rechaza %s sin cambiar nada',
    async (_n, entrada, campos) => {
      const { f, esc } = montar({ fila: { color: '#aabbcc' } });
      const antes = f.fila();
      const r = await esc.guardar(entrada, USER);
      expect(r).toEqual({ ok: false, error: 'validacion', campos });
      expect(f.fila()).toEqual(antes);
      expect(f.archivos().size).toBe(0);
    }
  );

  it('mezcla válido + inválido: solo el motivo del inválido y nada se sube', async () => {
    const { f, esc } = montar();
    const r = await esc.guardar(
      { color: '#112233', logo: archivo(new Uint8Array(10), 'image/jpeg') },
      USER
    );
    expect(r).toEqual({
      ok: false,
      error: 'validacion',
      campos: { logo: 'tipo' },
    });
    expect(f.fila()).toBeNull();
    expect(f.archivos().size).toBe(0);
  });

  it('bytes que no coinciden con el tipo declarado: tipo', async () => {
    const { f, esc } = montar();
    const jpeg = new Uint8Array(40);
    jpeg.set([0xff, 0xd8, 0xff, 0xe0]);
    const r = await esc.guardar({ logo: archivo(jpeg, 'image/png') }, USER);
    expect(r).toMatchObject({ ok: false, campos: { logo: 'tipo' } });
    expect(f.archivos().size).toBe(0);
  });

  it('SVG con <script> y onload se guarda sin ellos; con DOCTYPE se rechaza', async () => {
    const { f, esc } = montar();
    const svg = enc(
      '<svg xmlns="http://www.w3.org/2000/svg" onload="x()"><script>alert(1)</script><rect width="1" height="1"/></svg>'
    );
    const r = await esc.guardar({ logo: archivo(svg, 'image/svg+xml') }, USER);
    expect(r.ok).toBe(true);
    const guardado = new TextDecoder().decode(
      f.archivos().get(f.fila()!.logo_ruta!)
    );
    expect(guardado).not.toMatch(/script|onload/i);
    expect(guardado).toContain('<rect');

    const malo = enc('<!DOCTYPE svg [<!ENTITY a "b">]><svg></svg>');
    const r2 = await esc.guardar(
      { logo: archivo(malo, 'image/svg+xml') },
      USER
    );
    expect(r2).toMatchObject({ ok: false, campos: { logo: 'tipo' } });
  });

  it('archivo vacío: lo que diga validarPut y nada cambia', async () => {
    const { f, esc } = montar();
    const vacio = archivo(new Uint8Array(0), 'application/octet-stream');
    const r = await esc.guardar({ logo: vacio, color: '#112233' }, USER);
    const esperado = validarPut({ logo: vacio, color: '#112233' });
    expect(esperado.ok).toBe(false);
    expect(r).toEqual(esperado);
    expect(f.fila()).toBeNull();
    expect(f.archivos().size).toBe(0);
  });

  it('ícono no cuadrado se guarda con aviso; cuadrado, sin aviso', async () => {
    const { esc } = montar();
    const a = await esc.guardar({ icono: archivo(png(32, 16)) }, USER);
    expect(a).toMatchObject({
      ok: true,
      avisos: [{ campo: 'icono', aviso: 'no-cuadrado' }],
    });
    const b = await esc.guardar({ icono: archivo(png(16, 16)) }, USER);
    expect(b).toMatchObject({ ok: true, avisos: [] });
  });

  it('sin campos', async () => {
    const { esc } = montar();
    expect(await esc.guardar({}, USER)).toEqual({
      ok: false,
      error: 'sin-campos',
    });
  });

  it('si el upsert falla: el nuevo se borra, el anterior queda y no se invalida', async () => {
    const base = montar();
    await base.esc.guardar({ logo: archivo(png(8, 8)) }, USER);
    const vieja = base.f.fila()!.logo_ruta!;
    const f = crearMarcaFalsa({
      dirConfig: conConfig(),
      fila: { logo_ruta: vieja },
      fallarUpsert: true,
    });
    f.archivos().set(vieja, png(8, 8));
    const esc = crearEscrituraMarca(f.deps);
    await expect(
      esc.guardar({ logo: archivo(png(9, 9)) }, USER)
    ).rejects.toThrow('upsert falló');
    expect([...f.archivos().keys()]).toEqual([vieja]);
    expect(f.fila()?.logo_ruta).toBe(vieja);
    expect(f.invalidaciones()).toBe(0);
  });
});

describe('restaurar', () => {
  it('logo con config/: vuelve a config, borra el archivo y deja la columna en null', async () => {
    const { f, esc } = montar();
    await esc.guardar({ logo: archivo(png(8, 8)) }, USER);
    const r = await esc.restaurar('logo', USER);
    expect(r.fuentes.logo).toBe('config');
    expect(f.archivos().size).toBe(0);
    expect(f.fila()?.logo_ruta).toBeNull();
  });

  it('logo sin config/: Stackless', async () => {
    const { f, esc } = montar({ dirConfig: conConfig(false) });
    await esc.guardar({ logo: archivo(png(8, 8)) }, USER);
    const r = await esc.restaurar('logo', USER);
    expect(r.fuentes.logo).toBe('defecto');
    expect(r.marca.logoUrl).toBe('/marca/logo?v=defecto');
    expect(f.archivos().size).toBe(0);
  });

  it('color sin fila: devuelve la marca igual', async () => {
    const { esc } = montar();
    const r = await esc.restaurar('color', USER);
    expect(MarcaApiSchema.safeParse(r).success).toBe(true);
    expect(r.fuentes.color).toBe('defecto');
  });
});

describe('aMarcaApi', () => {
  it('nombre de config/ de 70 caracteres cae a Stackless y cumple el esquema', async () => {
    const { esc } = montar({ dirConfig: conConfig(false, 'a'.repeat(70)) });
    const m = await esc.leer();
    expect(m.marca.nombre).toBe('Stackless');
    expect(m.fuentes.nombre).toBe('defecto');
    expect(MarcaApiSchema.safeParse(m).success).toBe(true);
    expect(typeof aMarcaApi).toBe('function');
  });
});
