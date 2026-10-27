import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import es from '../../../messages/es.json';
import { CATALOGO_V1 } from '@contracts/emp/company-sections';
import type { SeccionId } from '@contracts/emp/company-sections';
import { enlacesMenuAvatar } from './menu-avatar';
import { MenuAvatarEnlaces } from '@/components/layout/menu-avatar-enlaces';

// El menú real solo monta sus ítems abierto; aquí se pintan como enlaces.
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenuItem: ({
    render,
    children,
  }: {
    render: React.ReactElement<{ children?: React.ReactNode }>;
    children: React.ReactNode;
  }) => React.cloneElement(render, {}, children),
}));

const todas = CATALOGO_V1.map((s) => s.id) as SeccionId[];
const html = (secciones: SeccionId[]) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="es" messages={es}>
      <MenuAvatarEnlaces secciones={secciones} />
    </NextIntlClientProvider>
  );

describe('menú del avatar', () => {
  const casos: Array<[string, SeccionId[], boolean]> = [
    ['Marketing (sin settings)', ['inbox', 'contacts', 'broadcasts'], false],
    ['Contestador', ['inbox'], false],
    ['sin perfil', [], false],
    ['admin', todas, true],
    ['superadmin', todas, true],
  ];
  for (const [nombre, secciones, conSettings] of casos) {
    it(`${nombre}: ${conSettings ? 'Perfil en settings y Configuración' : 'Perfil a /cuenta, sin Configuración'}`, () => {
      const e = enlacesMenuAvatar(secciones);
      expect(e.perfil).toBe(conSettings ? '/settings?tab=profile' : '/cuenta');
      expect(e.configuracion).toBe(conSettings ? '/settings?tab=whatsapp' : null);
      const out = html(secciones);
      expect(out).toContain(`href="${e.perfil}"`);
      expect(out.includes('/settings?tab=whatsapp')).toBe(conSettings);
      if (!conSettings) expect(out).not.toContain('/settings');
    });
  }
});
