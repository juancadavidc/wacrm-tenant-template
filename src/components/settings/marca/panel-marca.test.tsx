import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { CONFIG_STUB } from '@contracts/marca/api.stub';
import type { MarcaApi } from '@contracts/marca/api';
import es from '../../../../messages/es.json';
import type { EstadoPanel } from './controlador-marca';
import { PanelMarcaVista } from './panel-marca';

vi.mock('@/components/marca/marca-context', () => ({
  useActualizarMarca: () => () => {},
}));

const api = (f: Partial<MarcaApi['fuentes']> = {}): MarcaApi => ({
  marca: {
    nombre: CONFIG_STUB.nombre,
    color: CONFIG_STUB.color,
    logoUrl: CONFIG_STUB.logoUrl,
    iconoUrl: CONFIG_STUB.logoUrl,
  },
  fuentes: {
    nombre: 'config',
    logo: 'config',
    icono: 'config',
    color: 'config',
    ...f,
  },
});

const estado = (o: Partial<EstadoPanel> = {}): EstadoPanel => ({
  fase: 'lista',
  actual: api(),
  borrador: {},
  previas: {},
  errores: {},
  iconoNoCuadrado: false,
  guardando: false,
  restaurado: null,
  errorGeneral: null,
  ...o,
});

const vistaBase: {
  nombre: string;
  color: string;
  logoUrl: string;
  iconoUrl: string;
} = {
  nombre: CONFIG_STUB.nombre,
  color: CONFIG_STUB.color,
  logoUrl: CONFIG_STUB.logoUrl,
  iconoUrl: CONFIG_STUB.logoUrl,
};

function render(
  e: EstadoPanel,
  o: { vista?: Partial<typeof vistaBase>; hayCambios?: boolean } = {}
) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="es" messages={es}>
      <PanelMarcaVista
        estado={e}
        vista={{ ...vistaBase, ...o.vista }}
        hayCambios={o.hayCambios ?? false}
        on={{
          texto: () => {},
          archivo: () => {},
          guardar: () => {},
          restaurar: () => {},
        }}
      />
    </NextIntlClientProvider>
  );
}

describe('PanelMarcaVista', () => {
  it('con todo en config/ muestra la fuente cuatro veces y ningún Restaurar', () => {
    const html = render(estado());
    expect(html.split('Fuente: config/').length - 1).toBe(4);
    expect(html).not.toContain('Restaurar');
  });

  it('Restaurar solo aparece en un campo con fuente base', () => {
    const html = render(estado({ actual: api({ logo: 'base' }) }));
    expect(html.split('Restaurar').length - 1).toBe(1);
    expect(html).toContain('Fuente: Subido aquí');
  });

  it('tras restaurar dice a dónde volvió', () => {
    expect(
      render(estado({ restaurado: { campo: 'logo', fuente: 'config' } }))
    ).toContain('Volvió a config/');
    expect(
      render(estado({ restaurado: { campo: 'logo', fuente: 'defecto' } }))
    ).toContain('Volvió a Stackless');
  });

  it('el motivo del logo va en un alert enlazado al input del logo', () => {
    const html = render(estado({ errores: { logo: 'tipo' } }));
    expect(html).toContain('Solo PNG, SVG o WebP');
    expect(html).toMatch(
      /role="alert"[^>]*id="marca-logo-error"|id="marca-logo-error"[^>]*role="alert"/
    );
    expect(html).toMatch(
      /id="marca-logo"[^>]*aria-describedby="marca-logo-error"|aria-describedby="marca-logo-error"[^>]*id="marca-logo"/
    );
  });

  it('avisa del ícono no cuadrado', () => {
    expect(render(estado({ iconoNoCuadrado: true }))).toContain(
      'El ícono no es cuadrado'
    );
  });

  it('la vista previa usa el ícono elegido en sidebar y pestaña, y el logo en login', () => {
    const html = render(estado(), {
      vista: { iconoUrl: 'blob:icono.png', logoUrl: 'blob:logo.png' },
    });
    expect(html).toMatch(
      /data-preview="sidebar"[^>]*src="blob:icono.png"|src="blob:icono.png"[^>]*data-preview="sidebar"/
    );
    expect(html).toMatch(
      /data-preview="tab"[^>]*src="blob:icono.png"|src="blob:icono.png"[^>]*data-preview="tab"/
    );
    expect(html).toMatch(
      /data-preview="login"[^>]*src="blob:logo.png"|src="blob:logo.png"[^>]*data-preview="login"/
    );
  });

  it('sin permiso solo dice que no hay permiso', () => {
    const html = render(estado({ fase: 'sin-permiso', actual: null }));
    expect(html).toContain('No tienes permiso para editar la marca');
    expect(html).not.toContain('type="file"');
  });

  it('nunca ofrece editar la firma Powered by', () => {
    for (const e of [estado(), estado({ errores: { logo: 'tipo' } })]) {
      const html = render(e);
      expect(html).not.toContain('Powered by');
      expect(html).not.toContain('Desarrollado por');
    }
  });

  it('sin cambios, Guardar está deshabilitado', () => {
    const boton = /<button[^>]*disabled=""[^>]*>Guardar<\/button>/;
    expect(render(estado(), { hayCambios: false })).toMatch(boton);
    expect(render(estado(), { hayCambios: true })).not.toMatch(boton);
  });
});
