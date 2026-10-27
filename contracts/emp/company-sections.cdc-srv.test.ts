// CDC de SRV.1 contra el stub de I1 (PRD wacrm-permisos-granulares)
import { describe, expect, it } from 'vitest';
import {
  seccionDeApi,
  seccionDeRuta,
  type FuenteSecciones,
} from './company-sections';
import { CUENTA_STUB, stubFuenteSecciones } from './company-sections.stub';

// Imita el único punto de comprobación de SRV.1 (la real es de SRV.1).
async function puedeEntrar(
  fuente: FuenteSecciones,
  pathname: string,
  tipo: 'pagina' | 'api'
): Promise<'ok' | 'apagada' | 'sin-seccion'> {
  const catalogo = await fuente.catalogo();
  const id =
    tipo === 'api'
      ? seccionDeApi(catalogo, pathname)
      : seccionDeRuta(catalogo, pathname);
  if (id === null) return 'sin-seccion';
  const { secciones } = await fuente.contratadas(CUENTA_STUB);
  return secciones.includes(id) ? 'ok' : 'apagada';
}

describe('CDC SRV.1 contra el stub de I1', () => {
  it('con Agentes de IA apagada, /api/ai/… es de una sección apagada', async () => {
    const f = stubFuenteSecciones();
    f.apagar('agents');
    expect(await puedeEntrar(f, '/api/ai/draft', 'api')).toBe('apagada');
    expect(await puedeEntrar(f, '/api/ai/config', 'api')).toBe('apagada');
  });
  it('con Agentes de IA apagada, la URL directa /agents es de una sección apagada', async () => {
    const f = stubFuenteSecciones();
    f.apagar('agents');
    expect(await puedeEntrar(f, '/agents', 'pagina')).toBe('apagada');
  });
  it('el menú sale del catálogo filtrado por lo contratado, sin depender del rol', async () => {
    const f = stubFuenteSecciones();
    f.apagar('agents');
    const c = await f.contratadas(CUENTA_STUB);
    const menu = (await f.catalogo())
      .filter((s) => c.secciones.includes(s.id))
      .map((s) => s.id);
    expect(menu).not.toContain('agents');
    expect(menu).toHaveLength(9);
  });
  it('una ruta /api sin sección se distingue de una apagada (R18)', async () => {
    const f = stubFuenteSecciones([]);
    expect(await puedeEntrar(f, '/api/account', 'api')).toBe('sin-seccion');
    expect(await puedeEntrar(f, '/api/v1/me', 'api')).toBe('sin-seccion');
  });
  it('prender de nuevo reabre sin recrear la fuente (R3)', async () => {
    const f = stubFuenteSecciones();
    f.apagar('agents');
    f.prender('agents');
    expect(await puedeEntrar(f, '/api/ai/draft', 'api')).toBe('ok');
  });
});
