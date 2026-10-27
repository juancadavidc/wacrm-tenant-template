import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { CATALOGO_V1 } from '@contracts/emp/company-sections';
import type { Vista } from '@/lib/permisos/vista-superadmin';
import es from '../../../messages/es.json';
import {
  AvisoCuentaEmpresa,
  InterruptoresSecciones,
  SinAccesoSuperadmin,
  aplicarCambio,
  cambiarPorApi,
} from './interruptores-secciones';
import { decidirPagina } from '@/lib/permisos/marca-superadmin';

function render(ui: React.ReactElement): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="es" messages={es}>
      {ui}
    </NextIntlClientProvider>
  );
}

const vista: Vista = {
  cuenta: { id: 'C1', nombre: 'Acme' },
  secciones: CATALOGO_V1.map((s) => ({
    id: s.id,
    nombre: s.nombre,
    ruta: s.ruta,
    prendida: s.id !== 'agents',
  })),
};

afterEach(() => vi.unstubAllGlobals());

describe('decidirPagina', () => {
  it('vive en un módulo sin la directiva use client (la página de servidor la llama)', () => {
    const ruta = join(process.cwd(), 'src/lib/permisos/marca-superadmin.ts');
    expect(readFileSync(ruta, 'utf8')).not.toMatch(/^\s*['"]use client['"]/m);
    const pagina = readFileSync(
      join(process.cwd(), 'src/app/(dashboard)/superadmin/page.tsx'),
      'utf8'
    );
    expect(pagina).not.toMatch(/decidirPagina[^;]*interruptores-secciones/);
    expect(pagina).toContain("from '@/lib/permisos/marca-superadmin'");
  });

  it('el owner no ve la vista: sin la marca → sin-acceso', () => {
    expect(decidirPagina({ app_metadata: { role: 'owner' } })).toBe(
      'sin-acceso'
    );
    expect(decidirPagina({ app_metadata: {} })).toBe('sin-acceso');
    expect(decidirPagina(null)).toBe('sin-acceso');
    // user_metadata no cuenta
    expect(
      decidirPagina({
        user_metadata: { wacrm_superadmin: true },
      } as unknown as Parameters<typeof decidirPagina>[0])
    ).toBe('sin-acceso');
  });
  it('con la marca → vista', () => {
    expect(decidirPagina({ app_metadata: { wacrm_superadmin: true } })).toBe(
      'vista'
    );
  });
});

describe('SinAccesoSuperadmin', () => {
  it('la URL directa sin la marca muestra "Sin acceso"', () => {
    const html = render(<SinAccesoSuperadmin />);
    expect(html).toContain('Sin acceso');
    expect(html).not.toContain('Agentes de IA');
  });
});

describe('InterruptoresSecciones', () => {
  it('lista las secciones con su interruptor', () => {
    const html = render(<InterruptoresSecciones inicial={vista} />);
    for (const s of CATALOGO_V1) expect(html).toContain(s.nombre);
    expect(html.match(/role="switch"/g)).toHaveLength(CATALOGO_V1.length);
    const agentes = html
      .split('<li')
      .find((f) => f.includes('Agentes de IA'))!;
    expect(agentes).not.toContain('aria-checked="true"');
    expect(agentes).toContain('Apagada');
  });
});

describe('aplicarCambio', () => {
  it('apaga y vuelve a prender agents sin tocar las demás', () => {
    const apagada = aplicarCambio(vista, 'agents', false);
    const prendida = aplicarCambio(apagada, 'agents', true);
    expect(prendida.secciones.find((s) => s.id === 'agents')!.prendida).toBe(
      true
    );
    const otras = (v: Vista) => v.secciones.filter((s) => s.id !== 'agents');
    expect(otras(prendida)).toEqual(otras(vista));
    expect(apagada.secciones.find((s) => s.id === 'agents')!.prendida).toBe(
      false
    );
  });
});

describe('cambiarPorApi', () => {
  it('lanza si la respuesta no es ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500 }))
    );
    await expect(cambiarPorApi('agents', false)).rejects.toThrow();
  });
  it('devuelve la Vista si es ok y usa PATCH', async () => {
    const f = vi.fn(async () => ({ ok: true, json: async () => vista }));
    vi.stubGlobal('fetch', f);
    await expect(cambiarPorApi('agents', false)).resolves.toEqual(vista);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/superadmin/secciones/agents');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ prendida: false });
  });
});

describe('menú', () => {
  it('ningún menú enlaza /superadmin', () => {
    const raiz = join(__dirname, '..', '..');
    const archivos: string[] = [];
    const recorrer = (d: string) => {
      for (const e of readdirSync(d)) {
        const p = join(d, e);
        if (statSync(p).isDirectory()) recorrer(p);
        else if (/\.tsx?$/.test(e) && !/\.test\./.test(e)) archivos.push(p);
      }
    };
    recorrer(join(raiz, 'components', 'layout'));
    archivos.push(join(raiz, 'app', '(dashboard)', 'dashboard-shell.tsx'));
    for (const a of archivos) {
      expect(readFileSync(a, 'utf8'), a).not.toContain('/superadmin');
    }
  });
});

describe('AvisoCuentaEmpresa', () => {
  it('dice cuántas encontró', () => {
    expect(render(<AvisoCuentaEmpresa encontradas={2} />)).toContain('2');
  });
});
