import { describe, expect, it } from 'vitest';
import {
  IDS_SECCION,
  SeccionesContratadasSchema,
  type SeccionId,
} from './company-sections';
import {
  CUENTA_STUB,
  stubFuenteSecciones,
  stubSeccionesContratadas,
} from './company-sections.stub';

describe('stub de I1', () => {
  it('por defecto todo está contratado (R20)', async () => {
    const r = await stubFuenteSecciones().contratadas(CUENTA_STUB);
    expect(r.secciones).toEqual([...IDS_SECCION]);
  });
  it('apagar se ve en la siguiente llamada, sin recrear la fuente (R3)', async () => {
    const f = stubFuenteSecciones();
    f.apagar('agents');
    expect((await f.contratadas(CUENTA_STUB)).secciones).not.toContain(
      'agents'
    );
    f.prender('agents');
    const s = (await f.contratadas(CUENTA_STUB)).secciones;
    expect(s.filter((x) => x === 'agents')).toHaveLength(1);
  });
  it('lo devuelto pasa el esquema y no expone el estado interno', async () => {
    const f = stubFuenteSecciones();
    const r = await f.contratadas(CUENTA_STUB);
    expect(() => SeccionesContratadasSchema.parse(r)).not.toThrow();
    r.secciones.length = 0;
    expect((await f.contratadas(CUENTA_STUB)).secciones).toHaveLength(10);
  });
  it('stubSeccionesContratadas rechaza ids fuera del catálogo', () => {
    expect(() => stubSeccionesContratadas(['crm' as SeccionId])).toThrow();
  });
});
