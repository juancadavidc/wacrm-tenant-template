import { describe, expect, it } from 'vitest';
import { png } from './imagen.fixtures';
import { coincideTipo, dimensiones, extensionDe } from './imagen';

const enc = (s: string) => new TextEncoder().encode(s);

function webp(trozo: 'VP8X' | 'VP8L', ancho: number, alto: number) {
  const b = new Uint8Array(40);
  b.set(enc('RIFF'), 0);
  b.set(enc('WEBP'), 8);
  b.set(enc(trozo), 12);
  if (trozo === 'VP8X') {
    const w = ancho - 1;
    const h = alto - 1;
    b.set([w & 255, (w >> 8) & 255, (w >> 16) & 255], 24);
    b.set([h & 255, (h >> 8) & 255, (h >> 16) & 255], 27);
  } else {
    const w = ancho - 1;
    const h = alto - 1;
    b[20] = 0x2f;
    b[21] = w & 255;
    b[22] = ((w >> 8) & 0x3f) | ((h & 3) << 6);
    b[23] = (h >> 2) & 255;
    b[24] = (h >> 10) & 0x0f;
  }
  return b;
}

describe('imagen', () => {
  it('PNG: tipo y medidas', () => {
    const b = png(32, 16);
    expect(coincideTipo(b, 'image/png')).toBe(true);
    expect(dimensiones(b, 'image/png')).toEqual({ ancho: 32, alto: 16 });
  });

  it('un JPEG declarado como PNG no coincide', () => {
    const jpeg = new Uint8Array(40);
    jpeg.set([0xff, 0xd8, 0xff, 0xe0], 0);
    expect(coincideTipo(jpeg, 'image/png')).toBe(false);
  });

  it('WebP VP8X y VP8L', () => {
    const x = webp('VP8X', 64, 64);
    expect(coincideTipo(x, 'image/webp')).toBe(true);
    expect(dimensiones(x, 'image/webp')).toEqual({ ancho: 64, alto: 64 });
    expect(dimensiones(webp('VP8L', 300, 120), 'image/webp')).toEqual({
      ancho: 300,
      alto: 120,
    });
  });

  it('SVG: viewBox, width/height y sin medidas', () => {
    const d = (s: string) => dimensiones(enc(s), 'image/svg+xml');
    expect(d('<svg viewBox="0 0 10 20"></svg>')).toEqual({
      ancho: 10,
      alto: 20,
    });
    expect(d('<svg width="5" height="5"></svg>')).toEqual({
      ancho: 5,
      alto: 5,
    });
    expect(d('<svg></svg>')).toBeNull();
    expect(
      coincideTipo(enc('<?xml version="1.0"?>\n<svg/>'), 'image/svg+xml')
    ).toBe(true);
    expect(coincideTipo(enc('<html></html>'), 'image/svg+xml')).toBe(false);
  });

  it('bytes cortos o rotos', () => {
    const corto = new Uint8Array([1, 2, 3]);
    expect(coincideTipo(corto, 'image/png')).toBe(false);
    expect(coincideTipo(corto, 'image/webp')).toBe(false);
    expect(dimensiones(corto, 'image/png')).toBeNull();
    expect(dimensiones(corto, 'image/webp')).toBeNull();
    expect(
      coincideTipo(new Uint8Array([0xff, 0xfe, 0xfd]), 'image/svg+xml')
    ).toBe(false);
  });

  it('extensionDe', () => {
    expect(extensionDe('image/svg+xml')).toBe('svg');
    expect(extensionDe('image/png')).toBe('png');
    expect(extensionDe('image/webp')).toBe('webp');
  });
});
