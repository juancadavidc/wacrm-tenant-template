// CDC de USR.1 contra el stub de I1 (PRD wacrm-permisos-granulares)
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  IDS_SECCION,
  SeccionIdSchema,
  recortarPorContratadas,
  type SeccionId,
} from './company-sections';
import { CUENTA_STUB, stubFuenteSecciones } from './company-sections.stub';

// Perfil ilustrativo; el real es de USR.1 (R15).
const marketing: SeccionId[] = [
  'contacts',
  'broadcasts',
  'automations',
  'agents',
];

describe('CDC USR.1 contra el stub de I1', () => {
  it('un perfil recibe solo lo contratado (R7)', async () => {
    const f = stubFuenteSecciones();
    f.apagar('agents');
    expect(
      recortarPorContratadas(marketing, await f.contratadas(CUENTA_STUB))
    ).toEqual(['contacts', 'broadcasts', 'automations']);
  });
  it('al prender de nuevo, el perfil recupera la sección (R6)', async () => {
    const f = stubFuenteSecciones();
    f.apagar('agents');
    f.prender('agents');
    expect(
      recortarPorContratadas(marketing, await f.contratadas(CUENTA_STUB))
    ).toContain('agents');
  });
  it('owner y admin reciben todo lo contratado', async () => {
    const f = stubFuenteSecciones();
    f.apagar('flows');
    const c = await f.contratadas(CUENTA_STUB);
    expect(recortarPorContratadas(IDS_SECCION, c)).toEqual(c.secciones);
  });
  it('un perfil puede nombrar cualquier sección del catálogo, no una inventada (R16)', () => {
    const esquema = z.array(SeccionIdSchema);
    expect(esquema.safeParse([...IDS_SECCION]).success).toBe(true);
    expect(esquema.safeParse(['crm']).success).toBe(false);
  });
  it('un perfil vacío (invitado sin perfil, R8) no recibe nada', async () => {
    const f = stubFuenteSecciones();
    expect(
      recortarPorContratadas([], await f.contratadas(CUENTA_STUB))
    ).toEqual([]);
  });
});
