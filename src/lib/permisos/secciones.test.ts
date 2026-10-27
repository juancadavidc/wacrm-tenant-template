import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CATALOGO_V1 } from '@contracts/emp/company-sections';
import {
  crearFuenteSecciones,
  leerContratadasSupabase,
  type LeerContratadas,
} from './secciones';

const UUID = '11111111-1111-4111-8111-111111111111';
const lector = (valor: readonly string[]): LeerContratadas =>
  vi.fn().mockResolvedValue(valor);

describe('crearFuenteSecciones (I1)', () => {
  it('catalogo() es CATALOGO_V1', async () => {
    expect(await crearFuenteSecciones(lector([])).catalogo()).toBe(
      CATALOGO_V1
    );
  });

  it('contratadas lee en cada llamada (R3)', async () => {
    let estado: readonly string[] = ['inbox', 'agents'];
    const leer = vi.fn(async () => estado);
    const fuente = crearFuenteSecciones(leer);
    expect((await fuente.contratadas(UUID)).secciones).toEqual([
      'inbox',
      'agents',
    ]);
    estado = ['inbox'];
    expect((await fuente.contratadas(UUID)).secciones).toEqual(['inbox']);
    expect(leer).toHaveBeenCalledTimes(2);
  });

  it('ordena por catálogo, sin repetidos', async () => {
    const r = await crearFuenteSecciones(
      lector(['agents', 'inbox', 'inbox'])
    ).contratadas(UUID);
    expect(r.secciones).toEqual(['inbox', 'agents']);
  });

  it('descarta ids que el contrato no conoce', async () => {
    const r = await crearFuenteSecciones(
      lector(['reportes', 'inbox'])
    ).contratadas(UUID);
    expect(r.secciones).toEqual(['inbox']);
  });

  it('cuenta sin filas → secciones vacías', async () => {
    expect(
      await crearFuenteSecciones(lector([])).contratadas(UUID)
    ).toEqual({ cuentaId: UUID, secciones: [] });
  });

  it('cuentaId que no es uuid lanza', async () => {
    await expect(
      crearFuenteSecciones(lector(['inbox'])).contratadas('no-uuid')
    ).rejects.toThrow();
  });
});

describe('leerContratadasSupabase', () => {
  it('llama la RPC con la cuenta', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: ['inbox'], error: null });
    const leer = leerContratadasSupabase({ rpc } as unknown as SupabaseClient);
    expect(await leer(UUID)).toEqual(['inbox']);
    expect(rpc).toHaveBeenCalledWith('permisos_secciones_contratadas', {
      p_account_id: UUID,
    });
  });

  it('un error de la RPC se lanza, no da todo prendido', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: 'x' } });
    const leer = leerContratadasSupabase({ rpc } as unknown as SupabaseClient);
    await expect(leer(UUID)).rejects.toThrow(/no se pudieron leer/);
  });
});
