// Verificación del publicador de I2 (MRC.1): `leerMarca()` y las rutas
// `/marca/logo` y `/marca/icono`, sin base real (fila inyectada, config/
// temporal). Lo que necesita Postgres lo cubre la IT de MRC.1.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FilaMarca } from '../../src/lib/marca/base';
import {
  crearArchivoMarca,
  crearLeerMarca,
  HEADERS_ARCHIVO_MARCA,
} from '../../src/lib/marca/marca';
import {
  armarMarca,
  MarcaSchema,
  URL_LOGO_DEFECTO,
  verificarRespuestaArchivo,
} from './marca';

const dirs: string[] = [];
function conf(archivos: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pub-marca-'));
  dirs.push(dir);
  for (const [rel, c] of Object.entries(archivos)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), c);
  }
  return dir;
}
afterEach(() => {
  while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true });
});

function fila(parcial: Partial<FilaMarca>): FilaMarca {
  return {
    nombre: null,
    color: null,
    logo_ruta: null,
    icono_ruta: null,
    actualizado_en: '2026-11-23T00:00:00Z',
    actualizado_por: null,
    ...parcial,
  };
}

const CONFIG = {
  'empresa.yaml': 'empresa:\n  nombre: Barú\n',
  'marca.yaml': 'marca:\n  color: "#e11d48"\n  logo: logo.png\n',
  'marca/logo.png': 'LOGO',
};

const leer = (f: FilaMarca | null | Error, dir: string) =>
  crearLeerMarca({
    fila: () => (f instanceof Error ? Promise.reject(f) : Promise.resolve(f)),
    dir: () => dir,
  })();

function archivos(f: FilaMarca | null, dir: string) {
  return crearArchivoMarca({
    fila: async () => f,
    descargar: async () => new Uint8Array([1, 2, 3]),
    dir: () => dir,
    stackless: () => new Uint8Array([9]),
  });
}

function respuesta(a: { cuerpo: Uint8Array; tipo: string } | null) {
  return a
    ? new Response(a.cuerpo as BodyInit, {
        headers: { 'Content-Type': a.tipo, ...HEADERS_ARCHIVO_MARCA },
      })
    : new Response(null, { status: 404 });
}

describe('verificación del publicador de I2 (MRC.1)', () => {
  it('leerMarca() devuelve una marca que pasa MarcaSchema', async () => {
    const m = await leer(fila({ color: '#112233' }), conf(CONFIG));
    expect(MarcaSchema.safeParse(m).success).toBe(true);
  });

  it('con color en la base y logo y nombre en config/, toma el color de la base y el resto de config/', async () => {
    const m = await leer(fila({ color: '#112233' }), conf(CONFIG));
    expect(m.fuentes).toMatchObject({
      color: 'base',
      nombre: 'config',
      logo: 'config',
    });
    expect(m.color).toBe('#112233');
    expect(m.nombre).toBe('Barú');
  });

  it('sin base ni config/, devuelve la marca de Stackless', async () => {
    const m = await leer(null, conf({}));
    expect(m).toEqual(armarMarca({}));
    expect(m.logoUrl).toBe(URL_LOGO_DEFECTO);
  });

  it('con la base caída, devuelve la marca de config/', async () => {
    const dir = conf(CONFIG);
    const m = await leer(new Error('caída'), dir);
    expect(m.fuentes.color).toBe('config');
    expect(m.fuentes.nombre).toBe('config');
  });

  it('al cambiar el archivo en la base, cambia la versión de iconoUrl', async () => {
    const dir = conf({});
    const a = await leer(fila({ icono_ruta: 'icono/a.png' }), dir);
    const b = await leer(fila({ icono_ruta: 'icono/b.png' }), dir);
    expect(a.iconoUrl).not.toBe(b.iconoUrl);
  });

  it('/marca/logo y /marca/icono responden 200 desde la base y desde config/ y cumplen verificarRespuestaArchivo', async () => {
    const dir = conf({
      ...CONFIG,
      'marca.yaml': 'marca:\n  logo: logo.png\n  icono: i.svg\n',
      'marca/i.svg': '<svg/>',
    });
    const enBase = archivos(
      fila({ logo_ruta: 'logo/a.png', icono_ruta: 'icono/a.svg' }),
      dir
    );
    const enConfig = archivos(null, dir);
    for (const a of [enBase, enConfig]) {
      for (const campo of ['logo', 'icono'] as const) {
        const res = respuesta(await a(campo));
        expect(res.status).toBe(200);
        expect(verificarRespuestaArchivo(res)).toEqual([]);
      }
    }
  });

  it('/marca/logo sin logo propio responde 200 con el logo de Stackless; /marca/icono sin ícono propio responde 404', async () => {
    const a = archivos(null, conf({}));
    const logo = respuesta(await a('logo'));
    expect(logo.status).toBe(200);
    expect(verificarRespuestaArchivo(logo)).toEqual([]);
    expect(respuesta(await a('icono')).status).toBe(404);
  });

  it('config/marca.yaml de hoy (solo logo y color) sigue valiendo sin cambios', async () => {
    const m = await leer(null, conf(CONFIG));
    expect(MarcaSchema.safeParse(m).success).toBe(true);
    expect(m.color).toBe('#e11d48');
    expect(m.iconoUrl).toBe(m.logoUrl);
  });
});
