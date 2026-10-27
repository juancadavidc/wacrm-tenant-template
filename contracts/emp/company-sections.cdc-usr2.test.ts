/**
 * CDC de USR.2 contra el stub de I1 (PRD wacrm-permisos-granulares).
 */
import { describe, expect, it } from 'vitest';

import { PerfilEntradaSchema } from '../../src/lib/permisos/perfiles';
import { IDS_SECCION, recortarPorContratadas } from './company-sections';
import { CUENTA_STUB, stubFuenteSecciones } from './company-sections.stub';

describe('CDC USR.2 contra el stub de I1', () => {
  it('el editor de perfiles lista las 10 secciones del catálogo con su nombre', async () => {
    const f = stubFuenteSecciones();
    const catalogo = await f.catalogo();
    expect(catalogo.map((s) => s.id)).toEqual([...IDS_SECCION]);
    expect(catalogo.find((s) => s.id === 'agents')?.nombre).toBe(
      'Agentes de IA'
    );
  });

  it('un perfil puede guardar cualquier sección del catálogo (R16)', () => {
    expect(
      PerfilEntradaSchema.safeParse({
        nombre: 'Todo',
        secciones: [...IDS_SECCION],
      }).success
    ).toBe(true);
  });

  it('un perfil que nombra una sección apagada no la da (R7)', async () => {
    const f = stubFuenteSecciones();
    f.apagar('flows');
    expect(
      recortarPorContratadas(
        ['inbox', 'flows'],
        await f.contratadas(CUENTA_STUB)
      )
    ).toEqual(['inbox']);
  });

  it('una edición del perfil se nota en la siguiente lectura (R13)', async () => {
    const f = stubFuenteSecciones();
    const c = await f.contratadas(CUENTA_STUB);
    expect(recortarPorContratadas(['inbox'], c)).not.toContain('agents');
    expect(recortarPorContratadas(['inbox', 'agents'], c)).toContain('agents');
  });
});
