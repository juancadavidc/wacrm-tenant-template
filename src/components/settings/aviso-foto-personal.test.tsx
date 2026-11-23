import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import es from '../../../messages/es.json';
import { AvisoFotoPersonal } from './aviso-foto-personal';

const render = (enlazar: boolean) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="es" messages={es}>
      <AvisoFotoPersonal enlazar={enlazar} />
    </NextIntlClientProvider>
  );

describe('AvisoFotoPersonal', () => {
  it('con permiso enlaza a Configuración → Marca', () => {
    const html = render(true);
    expect(html).toContain(
      'Esta es tu foto personal. El logo de la empresa se cambia en'
    );
    expect(html).toContain('href="/settings?tab=brand"');
    expect(html).toContain('Configuración → Marca');
  });

  it('sin permiso muestra el texto sin enlace', () => {
    const html = render(false);
    expect(html).toContain('Configuración → Marca');
    expect(html).not.toContain('href=');
  });
});
