import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import es from '../../../messages/es.json';
import { FormPerfil, ListaPerfiles } from './profiles-panel';

function render(ui: React.ReactElement): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="es" messages={es}>
      {ui}
    </NextIntlClientProvider>
  );
}

const asesor = {
  id: 'p1',
  nombre: 'Asesor',
  secciones: ['inbox', 'contacts', 'pipelines'] as const,
  deFabrica: true,
  usuarios: 2,
};

describe('ListaPerfiles', () => {
  it('muestra los perfiles de fábrica con sus secciones y usuarios', () => {
    const html = render(
      <ListaPerfiles
        perfiles={[{ ...asesor, secciones: [...asesor.secciones] }]}
        onEditar={() => {}}
        onNuevo={() => {}}
      />
    );
    for (const t of [
      'Asesor',
      'De fábrica',
      'Bandeja de entrada',
      'Pipelines',
      '2 usuarios',
    ]) {
      expect(html).toContain(t);
    }
  });
});

describe('FormPerfil', () => {
  const montar = (inicial: Parameters<typeof FormPerfil>[0]['inicial']) =>
    render(
      <FormPerfil
        inicial={inicial}
        guardando={false}
        onGuardar={() => {}}
        onCancelar={() => {}}
      />
    );

  it('ofrece las 10 secciones del catálogo (R16)', () => {
    const html = montar(null);
    expect(html.match(/role="checkbox"/g)).toHaveLength(10);
    expect(html).toContain('Agentes de IA');
    expect(html).toContain('Configuración');
  });

  it('marca las secciones del perfil al editar', () => {
    const html = montar({
      nombre: 'Asesor',
      secciones: ['inbox', 'contacts', 'pipelines'],
    });
    const cajas = html.match(/<(?:button|span)[^>]*role="checkbox"[^>]*>/g)!;
    const marcadas = cajas.filter((c) => c.includes('aria-checked="true"'));
    expect(marcadas).toHaveLength(3);
    expect(html).toContain('value="Asesor"');
  });

  it('muestra la nota de lo no contratado', () => {
    expect(montar(null)).toContain('no tiene contratadas');
  });
});
