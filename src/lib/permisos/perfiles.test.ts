import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import {
  AsignacionSchema,
  PerfilEntradaSchema,
  errorRpcAEstado,
  listarPerfiles,
} from './perfiles';

describe('PerfilEntradaSchema', () => {
  it('acepta cualquier sección del catálogo (R16)', () => {
    expect(
      PerfilEntradaSchema.safeParse({
        nombre: 'Ventas',
        secciones: ['agents', 'settings'],
      }).success
    ).toBe(true);
  });

  it('rechaza secciones inventadas, repetidas, nombre vacío y llaves de más', () => {
    const casos = [
      { nombre: 'X', secciones: ['reportes'] },
      { nombre: 'X', secciones: ['inbox', 'inbox'] },
      { nombre: '  ', secciones: ['inbox'] },
      { nombre: 'X', secciones: ['inbox'], deFabrica: true },
    ];
    for (const c of casos) {
      expect(PerfilEntradaSchema.safeParse(c).success).toBe(false);
    }
  });
});

describe('AsignacionSchema', () => {
  it('acepta null para quitar el perfil', () => {
    expect(AsignacionSchema.safeParse({ perfilId: null }).success).toBe(true);
    expect(AsignacionSchema.safeParse({ perfilId: 'x' }).success).toBe(false);
  });
});

describe('errorRpcAEstado', () => {
  it.each([
    ['42501', 'x', 403],
    ['22023', 'Perfil no encontrado', 404],
    ['22023', 'x', 400],
    ['23514', 'x', 400],
    ['23505', 'x', 409],
    ['XX000', 'x', 500],
  ] as const)('errorRpcAEstado %s %s → %i', (code, message, esperado) => {
    expect(errorRpcAEstado({ code, message })).toBe(esperado);
  });
});

describe('listarPerfiles', () => {
  it('cuenta usuarios por perfil y omite secciones desconocidas', async () => {
    const tablas: Record<string, unknown[]> = {
      permisos_perfiles: [
        {
          id: 'p1',
          nombre: 'Asesor',
          secciones: ['inbox', 'reportes'],
          de_fabrica: true,
        },
        { id: 'p2', nombre: 'Otro', secciones: ['agents'], de_fabrica: false },
      ],
      permisos_perfil_usuario: [
        { perfil_id: 'p1' },
        { perfil_id: 'p1' },
        { perfil_id: 'p2' },
      ],
    };
    const consulta = (tabla: string) => {
      const q: Record<string, unknown> = {
        select: () => q,
        eq: () => q,
        order: () => q,
        then: (ok: (v: unknown) => void) =>
          ok({ data: tablas[tabla], error: null }),
      };
      return q;
    };
    const supabase = { from: consulta } as unknown as SupabaseClient;
    const r = await listarPerfiles(supabase, 'c1');
    expect(r[0]).toMatchObject({
      id: 'p1',
      usuarios: 2,
      secciones: ['inbox'],
      deFabrica: true,
    });
    expect(r[1]).toMatchObject({ id: 'p2', usuarios: 1 });
  });
});
