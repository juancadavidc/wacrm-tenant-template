import { describe, expect, it } from 'vitest';
import { limpiarSvg } from './svg';

const NS = 'xmlns="http://www.w3.org/2000/svg"';

describe('limpiarSvg', () => {
  it('quita <script> y onload', () => {
    const r = limpiarSvg(
      `<svg ${NS} onload="x()"><script>alert(1)</script><rect width="1" height="1"/></svg>`
    )!;
    expect(r).not.toMatch(/script|onload/i);
    expect(r).toContain('<rect');
  });

  it('quita on* sin importar mayúsculas', () => {
    const r = limpiarSvg(
      `<svg ${NS} ONLOAD="x()"><rect onClick="y()" width="1"/></svg>`
    )!;
    expect(r).not.toMatch(/onload|onclick/i);
    expect(r).toContain('width="1"');
  });

  it('quita referencias externas y conserva las internas', () => {
    const r = limpiarSvg(
      `<svg ${NS}><use href="https://x/a.svg#i"/><use xlink:href="javascript:alert(1)"/><use href="#i"/></svg>`
    )!;
    expect(r).not.toContain('https://x');
    expect(r).not.toContain('javascript');
    expect(r).toContain('href="#i"');
  });

  it('limpia style y <style>', () => {
    const r = limpiarSvg(
      `<svg ${NS}><rect style="fill:url(http://x)"/><rect style="fill:url(#g)"/><style>@import url(http://x);</style></svg>`
    )!;
    expect(r).not.toContain('http://x');
    expect(r).toContain('url(#g)');
    expect(r).not.toContain('<style');
  });

  it('quita foreignObject con su contenido y elementos desconocidos', () => {
    const r = limpiarSvg(
      `<svg ${NS}><foreignObject><iframe src="x"></iframe><div>hola</div></foreignObject><animate attributeName="x"/><rect/></svg>`
    )!;
    expect(r).not.toMatch(/foreignObject|iframe|hola|animate/i);
    expect(r).toContain('<rect/>');
  });

  it('rechaza DOCTYPE/ENTITY y lo que no es SVG', () => {
    expect(
      limpiarSvg(`<!DOCTYPE svg [<!ENTITY a "b">]><svg ${NS}></svg>`)
    ).toBeNull();
    expect(limpiarSvg('<html></html>')).toBeNull();
    expect(limpiarSvg('hola')).toBeNull();
    expect(limpiarSvg(`<svg ${NS}><g></svg>`)).toBeNull();
  });

  it('un SVG limpio sale con los mismos elementos y atributos', () => {
    const r = limpiarSvg('<svg viewBox="0 0 10 10"><path d="M0 0h10"/></svg>');
    expect(r).toBe('<svg viewBox="0 0 10 10"><path d="M0 0h10"/></svg>');
  });
});
