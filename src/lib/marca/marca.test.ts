import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { armarMarca } from '@contracts/marca/marca';
import { afterEach, describe, expect, it } from 'vitest';
import type { FilaMarca } from './base';
import { leerCandidatoConfig } from './config';
import { crearLeerMarca, metadataDeMarca } from './marca';

const dirs: string[] = [];
function conf(archivos: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'marca-'));
  dirs.push(dir);
  for (const [rel, contenido] of Object.entries(archivos)) {
    const ruta = path.join(dir, rel);
    fs.mkdirSync(path.dirname(ruta), { recursive: true });
    fs.writeFileSync(ruta, contenido);
  }
  return dir;
}
afterEach(() => {
  while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true });
});

const EMPRESA = 'empresa:\n  id: baru\n  nombre: "Grifería Barú"\n';
const CONFIG = {
  'empresa.yaml': EMPRESA,
  'marca.yaml': 'marca:\n  color: "#e11d48"\n  logo: logo.png\n',
  'marca/logo.png': 'x',
};

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

const leer = (f: FilaMarca | null, dir: string) =>
  crearLeerMarca({ fila: async () => f, dir: () => dir })();

describe('leerMarca', () => {
  it('color en la base, nombre y logo en config/', async () => {
    const m = await leer(fila({ color: '#112233' }), conf(CONFIG));
    expect(m.color).toBe('#112233');
    expect(m.fuentes.color).toBe('base');
    expect(m.nombre).toBe('Grifería Barú');
    expect(m.fuentes.nombre).toBe('config');
    expect(m.logoUrl).toMatch(/^\/marca\/logo\?v=/);
    expect(m.fuentes.logo).toBe('config');
  });

  it('sin nada → marca de Stackless', async () => {
    expect(await leer(null, conf({}))).toEqual(armarMarca({}));
  });

  it('base que falla → marca de config/', async () => {
    const dir = conf(CONFIG);
    const m = await crearLeerMarca({
      fila: () => Promise.reject(new Error('caída')),
      dir: () => dir,
    })();
    expect(m).toEqual(armarMarca({ config: leerCandidatoConfig(dir) }));
  });

  it('al cambiar el archivo en la base, cambia iconoUrl', async () => {
    const dir = conf({});
    const a = await leer(fila({ icono_ruta: 'icono/a.png' }), dir);
    const b = await leer(fila({ icono_ruta: 'icono/b.png' }), dir);
    expect(a.iconoUrl).toMatch(/^\/marca\/icono\?v=/);
    expect(b.iconoUrl).toMatch(/^\/marca\/icono\?v=/);
    expect(a.iconoUrl).not.toBe(b.iconoUrl);
  });

  it('extensión desconocida en la base pasa a config/', async () => {
    const m = await leer(fila({ logo_ruta: 'logo/a.gif' }), conf(CONFIG));
    expect(m.fuentes.logo).toBe('config');
  });

  it('nombre de la base de más de 60 caracteres pasa a config/', async () => {
    const m = await leer(fila({ nombre: 'x'.repeat(61) }), conf(CONFIG));
    expect(m.nombre).toBe('Grifería Barú');
    expect(m.fuentes.nombre).toBe('config');
  });

  it('logo de config/ sin ícono: el ícono es el logo', async () => {
    const m = await leer(null, conf(CONFIG));
    expect(m.iconoUrl).toBe(m.logoUrl);
    expect(m.fuentes.icono).toBe('config');
  });
});

describe('metadataDeMarca', () => {
  it('ícono de la base y título con plantilla', async () => {
    const m = await leer(
      fila({ icono_ruta: 'icono/a.png' }),
      conf({ 'empresa.yaml': 'empresa:\n  nombre: Barú\n' })
    );
    const md = metadataDeMarca(m);
    expect(md.title).toEqual({ default: 'Barú', template: '%s — Barú' });
    expect(JSON.stringify(md.icons)).toContain('/marca/icono?v=');
  });
});
