import { TIPOS_IMAGEN } from '@contracts/marca/api';

/**
 * Tipo real y dimensiones de una imagen mirando sus bytes (MRC.2, decisiones
 * 5 y 7). Sin dependencias: solo cabeceras.
 */

export type TipoImagen = (typeof TIPOS_IMAGEN)[number];
export type Dimensiones = { ancho: number; alto: number };

const FIRMA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const ascii = (b: Uint8Array, desde: number, n: number): string =>
  String.fromCharCode(...b.slice(desde, desde + n));
const u32be = (b: Uint8Array, o: number): number =>
  ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0;
const u16le = (b: Uint8Array, o: number): number => b[o]! | (b[o + 1]! << 8);
const u24le = (b: Uint8Array, o: number): number =>
  b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16);

function esPng(b: Uint8Array): boolean {
  return b.length >= 24 && FIRMA_PNG.every((v, i) => b[i] === v);
}

function esWebp(b: Uint8Array): boolean {
  return (
    b.length >= 30 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP'
  );
}

/** Texto del SVG (UTF-8 estricto) sin BOM, declaración XML ni comentarios. */
function cabeceraSvg(b: Uint8Array): string | null {
  let t: string;
  try {
    t = new TextDecoder('utf-8', { fatal: true }).decode(b);
  } catch {
    return null;
  }
  t = t.replace(/^﻿/, '');
  for (;;) {
    t = t.trimStart();
    if (t.startsWith('<?')) {
      const fin = t.indexOf('?>');
      if (fin < 0) return null;
      t = t.slice(fin + 2);
    } else if (t.startsWith('<!--')) {
      const fin = t.indexOf('-->');
      if (fin < 0) return null;
      t = t.slice(fin + 3);
    } else {
      break;
    }
  }
  return /^<svg[\s/>]/.test(t) ? t : null;
}

/** Los bytes son del tipo declarado. */
export function coincideTipo(bytes: Uint8Array, tipo: TipoImagen): boolean {
  if (tipo === 'image/png') return esPng(bytes);
  if (tipo === 'image/webp') return esWebp(bytes);
  return cabeceraSvg(bytes) !== null;
}

function medidaSvg(t: string): Dimensiones | null {
  const etiqueta = /^<svg[^>]*>/.exec(t)?.[0] ?? '';
  const attr = (n: string) =>
    new RegExp(`\\s${n}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(etiqueta);
  const vb = attr('viewBox');
  const caja = vb?.[1] ?? vb?.[2];
  if (caja) {
    const n = caja
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (n.length === 4 && n.every(Number.isFinite) && n[2]! > 0 && n[3]! > 0) {
      return { ancho: n[2]!, alto: n[3]! };
    }
  }
  const num = (n: string) => {
    const m = attr(n);
    const v = m?.[1] ?? m?.[2];
    if (!v) return null;
    const x = /^\s*(\d+(?:\.\d+)?)(?:px)?\s*$/.exec(v);
    return x ? Number(x[1]) : null;
  };
  const ancho = num('width');
  const alto = num('height');
  return ancho && alto ? { ancho, alto } : null;
}

/** Ancho y alto leídos de los bytes; null si no se pueden leer. */
export function dimensiones(
  bytes: Uint8Array,
  tipo: TipoImagen
): Dimensiones | null {
  if (tipo === 'image/png') {
    if (!esPng(bytes)) return null;
    const ancho = u32be(bytes, 16);
    const alto = u32be(bytes, 20);
    return ancho > 0 && alto > 0 ? { ancho, alto } : null;
  }
  if (tipo === 'image/webp') {
    if (!esWebp(bytes)) return null;
    const trozo = ascii(bytes, 12, 4);
    if (trozo === 'VP8X' && bytes.length >= 30) {
      return { ancho: 1 + u24le(bytes, 24), alto: 1 + u24le(bytes, 27) };
    }
    if (trozo === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
      return {
        ancho: 1 + (bytes[21]! | ((bytes[22]! & 0x3f) << 8)),
        alto:
          1 +
          ((bytes[22]! >> 6) | (bytes[23]! << 2) | ((bytes[24]! & 0x0f) << 10)),
      };
    }
    if (trozo === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 0x01) {
      return {
        ancho: u16le(bytes, 26) & 0x3fff,
        alto: u16le(bytes, 28) & 0x3fff,
      };
    }
    return null;
  }
  const t = cabeceraSvg(bytes);
  return t ? medidaSvg(t) : null;
}

export function extensionDe(tipo: TipoImagen): 'png' | 'svg' | 'webp' {
  if (tipo === 'image/png') return 'png';
  if (tipo === 'image/webp') return 'webp';
  return 'svg';
}
