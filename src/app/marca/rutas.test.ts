import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { verificarRespuestaArchivo } from '@contracts/marca/marca';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FilaMarca } from '@/lib/marca/base';
import { crearArchivoMarca, HEADERS_ARCHIVO_MARCA } from '@/lib/marca/marca';

vi.mock('@/lib/marca/base', async (orig) => ({
  ...(await orig<typeof import('@/lib/marca/base')>()),
  filaMarcaCacheada: async () => null,
}));

const previo = process.env.CONFIG_EMPRESA_DIR;
const dirs: string[] = [];
afterEach(() => {
  if (previo === undefined) delete process.env.CONFIG_EMPRESA_DIR;
  else process.env.CONFIG_EMPRESA_DIR = previo;
  while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true });
});

function conConfig(archivos: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rutas-'));
  dirs.push(dir);
  for (const [rel, c] of Object.entries(archivos)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), c);
  }
  return dir;
}

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

const STACKLESS = new Uint8Array([9, 9, 9]);
const bytes = (s: string) => new TextEncoder().encode(s);
const texto = (u: Uint8Array) => new TextDecoder().decode(u);

function archivo(
  f: FilaMarca | null,
  dir: string,
  descargar: (r: string) => Promise<Uint8Array | null> = async () => null
) {
  return crearArchivoMarca({
    fila: async () => f,
    descargar,
    dir: () => dir,
    stackless: () => STACKLESS,
  });
}

const CONFIG = {
  'marca.yaml': 'marca:\n  logo: logo.png\n  icono: icono.svg\n',
  'marca/logo.png': 'LOGOCFG',
  'marca/icono.svg': '<svg/>',
};

describe('archivos de marca', () => {
  it('200 desde la base', async () => {
    const dl = async (r: string) => bytes(`BASE:${r}`);
    const f = fila({ icono_ruta: 'icono/a.svg', logo_ruta: 'logo/a.png' });
    const a = archivo(f, conConfig(CONFIG), dl);
    const icono = await a('icono');
    const logo = await a('logo');
    expect(texto(icono!.cuerpo)).toBe('BASE:icono/a.svg');
    expect(icono!.tipo).toBe('image/svg+xml');
    expect(texto(logo!.cuerpo)).toBe('BASE:logo/a.png');
    expect(logo!.tipo).toBe('image/png');
  });

  it('200 desde config/', async () => {
    const a = archivo(null, conConfig(CONFIG));
    expect(texto((await a('logo'))!.cuerpo)).toBe('LOGOCFG');
    expect(texto((await a('icono'))!.cuerpo)).toBe('<svg/>');
  });

  it('descarga fallida en la base → archivo de config/', async () => {
    const a = archivo(
      fila({ logo_ruta: 'logo/a.png' }),
      conConfig(CONFIG),
      async () => null
    );
    expect(texto((await a('logo'))!.cuerpo)).toBe('LOGOCFG');
  });

  it('sin nada: ícono null y logo de Stackless', async () => {
    const a = archivo(null, conConfig({}));
    expect(await a('icono')).toBeNull();
    const logo = await a('logo');
    expect(logo!.tipo).toBe('image/png');
    expect(logo!.cuerpo).toBe(STACKLESS);
  });

  it('logo propio sin ícono → /marca/icono null', async () => {
    const a = archivo(
      null,
      conConfig({
        'marca.yaml': 'marca:\n  logo: logo.png\n',
        'marca/logo.png': 'L',
      })
    );
    expect(await a('icono')).toBeNull();
  });
});

describe('GET /marca/logo y /marca/icono', () => {
  it('200 con headers de R10 y cumple el contrato', async () => {
    process.env.CONFIG_EMPRESA_DIR = conConfig(CONFIG);
    const { GET: logo } = await import('./logo/route');
    const { GET: icono } = await import('./icono/route');
    for (const GET of [logo, icono]) {
      const res = await GET();
      expect(res.status).toBe(200);
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('content-security-policy')).toContain('sandbox');
      expect(res.headers.get('cache-control')).toContain('max-age=300');
      expect(verificarRespuestaArchivo(res)).toEqual([]);
    }
    expect(HEADERS_ARCHIVO_MARCA['Cache-Control']).toBe('public, max-age=300');
  });

  it('sin nada: /marca/icono 404 y /marca/logo 200 de Stackless', async () => {
    process.env.CONFIG_EMPRESA_DIR = conConfig({});
    const { GET: logo } = await import('./logo/route');
    const { GET: icono } = await import('./icono/route');
    expect((await icono()).status).toBe(404);
    const res = await logo();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(verificarRespuestaArchivo(res)).toEqual([]);
  });
});
