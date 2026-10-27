import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import es from '../../../messages/es.json';
import { SinAccesoSeccion } from './sin-acceso-seccion';
import SinAccesoPage from '../../app/(dashboard)/sin-acceso/page';

function render(ui: React.ReactElement): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="es" messages={es}>
      {ui}
    </NextIntlClientProvider>
  );
}

describe('SinAccesoSeccion', () => {
  it('muestra el aviso con el nombre de la sección y el enlace de volver', () => {
    const html = render(<SinAccesoSeccion nombre="Agentes de IA" />);
    expect(html).toContain('Sin acceso');
    expect(html).toContain('Agentes de IA');
    expect(html).toContain('Volver al panel');
  });

  it('la página busca la sección en el catálogo', async () => {
    const html = render(
      await SinAccesoPage({ searchParams: Promise.resolve({ seccion: 'agents' }) })
    );
    expect(html).toContain('Agentes de IA');
  });

  it('una sección inventada muestra el texto genérico', async () => {
    const html = render(
      await SinAccesoPage({
        searchParams: Promise.resolve({ seccion: 'inventada' }),
      })
    );
    expect(html).toContain('Esta sección no está activa');
  });
});
