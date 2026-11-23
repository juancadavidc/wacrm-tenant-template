import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { stubMarca } from '@contracts/marca/marca.stub';
import { metadataDeMarca } from '@/lib/marca/marca';
import { MarcaProvider } from './marca-context';
import { MarcaLogo, MarcaLogoCompleto } from './marca-logo';

function render(ui: React.ReactElement, m: ReturnType<typeof stubMarca>) {
  return renderToStaticMarkup(<MarcaProvider marca={m}>{ui}</MarcaProvider>);
}

function favicon(m: ReturnType<typeof stubMarca>): string {
  const icon = metadataDeMarca(m).icons as { icon: { url: string }[] };
  return icon.icon[0].url;
}

describe('marca en la UI', () => {
  it('con ícono en la base, favicon y sidebar apuntan a /marca/icono', () => {
    const m = stubMarca('iconoEnBase');
    expect(favicon(m)).toMatch(/^\/marca\/icono\?v=/);
    expect(render(<MarcaLogo />, m)).toContain('src="/marca/icono?v=');
  });

  it('sin ícono, favicon y sidebar usan el logo completo', () => {
    const m = stubMarca('soloConfig');
    expect(favicon(m)).toBe(m.logoUrl);
    expect(m.logoUrl).toMatch(/^\/marca\/logo\?v=/);
    expect(render(<MarcaLogo />, m)).toContain(`src="${m.logoUrl}"`);
  });

  it('el sidebar no deforma el logo completo', () => {
    const html = render(
      <MarcaLogo className="h-8 w-8" />,
      stubMarca('soloConfig')
    );
    expect(html).toContain('object-contain');
  });

  it('el acceso usa el logo completo', () => {
    const m = stubMarca('iconoEnBase');
    const html = render(<MarcaLogoCompleto />, m);
    expect(html).toContain(`src="${m.logoUrl}"`);
    expect(html).not.toContain('/marca/icono');
  });
});
