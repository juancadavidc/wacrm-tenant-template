import { describe, expect, it } from 'vitest';
import { MarcaSchema, verificarRespuestaArchivo } from './marca';
import {
  CANDIDATOS_STUB,
  stubLeerMarca,
  stubMarca,
  stubRutaArchivo,
} from './marca.stub';

describe('stub de I2', () => {
  it.each(Object.keys(CANDIDATOS_STUB) as (keyof typeof CANDIDATOS_STUB)[])(
    'stubMarca(%s) cumple el contrato',
    (k) => {
      MarcaSchema.parse(stubMarca(k));
    }
  );

  it('stubLeerMarca resuelve la misma marca', async () => {
    const m = stubMarca('iconoEnBase');
    expect(await stubLeerMarca(m)()).toEqual(m);
  });

  it('la ruta de archivo cumple el contrato o da 404', async () => {
    const ok = await stubRutaArchivo({
      tipo: 'image/svg+xml',
      cuerpo: '<svg/>',
    })();
    expect(ok.status).toBe(200);
    expect(verificarRespuestaArchivo(ok)).toEqual([]);
    expect((await stubRutaArchivo(null)()).status).toBe(404);
  });
});
