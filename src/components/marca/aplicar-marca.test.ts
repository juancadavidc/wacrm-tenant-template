import { describe, expect, it } from 'vitest';
import type { MarcaApi } from '@contracts/marca/api';
import { stubMarca } from '@contracts/marca/marca.stub';
import { cssDeMarca } from '@/lib/marca/color';
import {
  aplicarMarcaEnDocumento,
  fusionarMarca,
  type DocumentoMarca,
} from './aplicar-marca';

function apiDe(nombre: Parameters<typeof stubMarca>[0]): MarcaApi {
  const m = stubMarca(nombre);
  return {
    marca: {
      nombre: m.nombre,
      color: m.color,
      logoUrl: m.logoUrl,
      iconoUrl: m.iconoUrl,
    },
    fuentes: m.fuentes,
  };
}

describe('fusionarMarca', () => {
  it('con la marca de hoy actualiza lo suyo y no agrega llaves', () => {
    const actual = {
      nombre: 'Barú',
      color: '#0a7d5a',
      logoPropio: false,
      logoUrl: '/stackless/logo.png',
      marcaUrl: '/stackless/mark.png',
    };
    const api: MarcaApi = {
      marca: {
        nombre: 'Nueva',
        color: '#112233',
        logoUrl: '/marca/logo?v=cfg1',
        iconoUrl: '/marca/icono?v=ico1',
      },
      fuentes: { nombre: 'base', logo: 'config', icono: 'base', color: 'base' },
    };
    const r = fusionarMarca(actual, api);
    expect(r.marcaUrl).toBe('/marca/icono?v=ico1');
    expect(r.logoUrl).toBe('/marca/logo?v=cfg1');
    expect(r.color).toBe('#112233');
    expect(r.nombre).toBe('Nueva');
    expect(r.logoPropio).toBe(true);
    expect(r).not.toHaveProperty('iconoUrl');
    expect(r).not.toHaveProperty('fuentes');
  });

  it('con la marca de I2 actualiza también iconoUrl y fuentes', () => {
    const r = fusionarMarca(stubMarca('soloConfig'), apiDe('iconoEnBase'));
    expect(r.iconoUrl).toBe(stubMarca('iconoEnBase').iconoUrl);
    expect(r.marcaUrl).toBe(r.iconoUrl);
    expect(r.fuentes.icono).toBe('base');
  });
});

function docFalso(links: number, conTokens = true) {
  const atributos = () => {
    const a: Record<string, string> = {};
    return { a, setAttribute: (k: string, v: string) => void (a[k] = v) };
  };
  const existentes = Array.from({ length: links }, atributos);
  const creados: ReturnType<typeof atributos>[] = [];
  const agregados: unknown[] = [];
  const tokens = { textContent: '' as string | null };
  const doc: DocumentoMarca = {
    head: { appendChild: (n) => void agregados.push(n) },
    querySelectorAll: () => existentes,
    getElementById: () => (conTokens ? tokens : null),
    createElement: () => {
      const l = atributos();
      creados.push(l);
      return l;
    },
  };
  return { doc, existentes, creados, agregados, tokens };
}

describe('aplicarMarcaEnDocumento', () => {
  const m = { color: '#2f7bf5', iconoUrl: '/marca/icono?v=ico1' };

  it('cambia el href de cada link de ícono', () => {
    const d = docFalso(2);
    aplicarMarcaEnDocumento(d.doc, m);
    expect(d.existentes.map((l) => l.a.href)).toEqual([m.iconoUrl, m.iconoUrl]);
    expect(d.creados).toHaveLength(0);
  });

  it('sin ningún link crea uno en head', () => {
    const d = docFalso(0);
    aplicarMarcaEnDocumento(d.doc, m);
    expect(d.creados).toHaveLength(1);
    expect(d.creados[0].a).toEqual({ rel: 'icon', href: m.iconoUrl });
    expect(d.agregados).toEqual([d.creados[0]]);
  });

  it('reescribe #marca-tokens y no lanza si falta', () => {
    const d = docFalso(1);
    aplicarMarcaEnDocumento(d.doc, m);
    expect(d.tokens.textContent).toBe(cssDeMarca(m.color));
    expect(() =>
      aplicarMarcaEnDocumento(docFalso(1, false).doc, m)
    ).not.toThrow();
  });
});
