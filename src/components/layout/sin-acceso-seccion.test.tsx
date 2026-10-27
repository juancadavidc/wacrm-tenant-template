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

  it('motivo perfil nombra la sección del perfil', () => {
    const html = render(<SinAccesoSeccion nombre="Configuración" motivo="perfil" />);
    expect(html).toContain('Tu perfil no incluye la sección Configuración');
  });

  it('motivo sin-perfil explica y enlaza a /cuenta', () => {
    const html = render(<SinAccesoSeccion nombre="Bandeja" motivo="sin-perfil" />);
    expect(html).toContain('Todavía no tienes un perfil asignado');
    expect(html).toContain('href="/cuenta"');
  });

  it('la página lee el motivo; uno desconocido vale apagada', async () => {
    const pagina = async (sp: { seccion?: string; motivo?: string }) =>
      render(await SinAccesoPage({ searchParams: Promise.resolve(sp) }));
    expect(await pagina({ seccion: 'settings', motivo: 'perfil' })).toContain(
      'Tu perfil no incluye'
    );
    expect(await pagina({ seccion: 'agents' })).toContain('no está activa');
    expect(await pagina({ seccion: 'agents', motivo: 'raro' })).toContain(
      'no está activa'
    );
  });
});
