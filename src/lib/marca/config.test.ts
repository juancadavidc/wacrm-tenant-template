import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { archivoConfig, ICONO_MAX_BYTES, leerCandidatoConfig } from './config';

const dirs: string[] = [];
function conf(archivos: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'marca-cfg-'));
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

describe.each(['logo', 'icono'] as const)('archivoConfig(%s)', (campo) => {
  it('rechaza rutas que salen de config/marca/', () => {
    const dir = conf({
      'marca.yaml': `marca:\n  ${campo}: ../secreto.png\n`,
      'secreto.png': 'x',
    });
    expect(archivoConfig(campo, dir)).toBeNull();
  });

  it('rechaza extensiones no permitidas', () => {
    const dir = conf({
      'marca.yaml': `marca:\n  ${campo}: a.gif\n`,
      'marca/a.gif': 'x',
    });
    expect(archivoConfig(campo, dir)).toBeNull();
  });

  it('rechaza si el archivo no existe', () => {
    const dir = conf({ 'marca.yaml': `marca:\n  ${campo}: a.png\n` });
    expect(archivoConfig(campo, dir)).toBeNull();
  });

  it('devuelve ruta, tipo y versión válida', () => {
    const dir = conf({
      'marca.yaml': `marca:\n  ${campo}: a.svg\n`,
      'marca/a.svg': '<svg/>',
    });
    const a = archivoConfig(campo, dir);
    expect(a).toMatchObject({
      ruta: path.join(dir, 'marca', 'a.svg'),
      tipo: 'image/svg+xml',
    });
    expect(a?.version).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
  });

  it('cambiar el archivo cambia la versión', () => {
    const dir = conf({
      'marca.yaml': `marca:\n  ${campo}: a.png\n`,
      'marca/a.png': 'uno',
    });
    const antes = archivoConfig(campo, dir)!.version;
    fs.writeFileSync(path.join(dir, 'marca', 'a.png'), 'dos-más-largo');
    expect(archivoConfig(campo, dir)!.version).not.toBe(antes);
  });
});

describe('archivoConfig: pesos', () => {
  it('ícono de más de 512 KB → null', () => {
    const dir = conf({
      'marca.yaml': 'marca:\n  icono: a.png\n',
      'marca/a.png': 'x'.repeat(ICONO_MAX_BYTES + 1),
    });
    expect(archivoConfig('icono', dir)).toBeNull();
  });
});

describe('leerCandidatoConfig', () => {
  it('nombre, color y logo de config/', () => {
    const dir = conf({
      'empresa.yaml': EMPRESA,
      'marca.yaml': 'marca:\n  color: "#e11d48"\n  logo: logo.png\n',
      'marca/logo.png': 'x',
    });
    expect(leerCandidatoConfig(dir)).toEqual({
      nombre: 'Grifería Barú',
      color: '#e11d48',
      logo: { version: expect.any(String) },
    });
  });

  it('YAML roto → vacío sin lanzar', () => {
    const dir = conf({ 'empresa.yaml': ': : [', 'marca.yaml': '{{{' });
    expect(leerCandidatoConfig(dir)).toEqual({});
  });

  it('marca.yaml de hoy (solo color y logo) no trae ícono', () => {
    const dir = conf({
      'marca.yaml': 'marca:\n  color: "#e11d48"\n  logo: logo.png\n',
      'marca/logo.png': 'x',
    });
    expect(leerCandidatoConfig(dir).icono).toBeUndefined();
  });
});
