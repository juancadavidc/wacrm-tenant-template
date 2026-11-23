import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import es from '../../../messages/es.json';
import { resolveSection } from './settings-sections';
import { SettingsRail } from './settings-rail';

const rail = (ocultas: Parameters<typeof SettingsRail>[0]['ocultas']) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="es" messages={es}>
      <SettingsRail active="overview" onSelect={() => {}} ocultas={ocultas} />
    </NextIntlClientProvider>
  );

describe('resolveSection', () => {
  it('brand solo con permiso de marca', () => {
    expect(resolveSection('brand', { marca: true })).toBe('brand');
    expect(resolveSection('brand', { marca: false })).toBe('overview');
    expect(resolveSection('brand')).toBe('overview');
  });

  it('no rompe lo de antes', () => {
    expect(resolveSection('tags')).toBe('fields');
    expect(resolveSection('nada')).toBe('overview');
    expect(resolveSection('members')).toBe('members');
  });
});

describe('SettingsRail con ocultas', () => {
  it('pinta Marca si no está oculta', () => {
    expect(rail([])).toContain('Marca');
  });

  it('no pinta Marca si está oculta, y sí el resto', () => {
    const html = rail(['brand']);
    expect(html).not.toContain('Marca');
    expect(html).toContain('Miembros del equipo');
  });
});
